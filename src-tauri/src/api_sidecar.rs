//! Sidecars.
//!
//! - Debug builds: spawn from local source checkouts (api/anime-api, proxy,
//!   api/anivexa) so `git pull` in those folders takes effect immediately.
//! - Release builds: spawn the bundled binaries via tauri-plugin-shell
//!   (registered as bundle.externalBin in tauri.conf.json).
//!
//! The frontend controls *which* URL it talks to via Settings — this only
//! keeps the default local instances alive and reaps them on exit.

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Child;
use std::time::Duration;

pub enum Proc {
    Dev(Child),
    #[cfg(not(debug_assertions))]
    Sidecar(tauri_plugin_shell::process::CommandChild),
}

pub struct Sidecars {
    pub procs: Vec<(&'static str, Proc)>,
}

fn port_open(addr: &str) -> bool {
    match addr.parse() {
        Ok(a) => TcpStream::connect_timeout(&a, Duration::from_millis(400)).is_ok(),
        Err(_) => false,
    }
}

fn python() -> String {
    std::env::var("KITAWATCH_PYTHON").unwrap_or_else(|_| {
        if cfg!(windows) {
            "python".to_string()
        } else {
            "python3".to_string()
        }
    })
}

fn find_dir(env_var: &str, markers: &[&str]) -> Option<PathBuf> {
    if let Ok(dir) = std::env::var(env_var) {
        let p = PathBuf::from(&dir);
        if p.exists() {
            return Some(p);
        }
    }
    for cand in ["..", "../..", "."] {
        for marker in markers {
            let p = PathBuf::from(cand).join(marker);
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(debug_assertions)]
mod imp {
    use super::*;
    use std::process::Command;

    fn spawn_uvicorn(dir: &PathBuf, app: &str, port: u16) -> Option<Child> {
        match Command::new(python())
            .args(["-m", "uvicorn", app, "--host", "127.0.0.1", "--port", &port.to_string()])
            .current_dir(dir)
            .spawn()
        {
            Ok(child) => {
                eprintln!("[kitawatch] started sidecar {app} on 127.0.0.1:{port}");
                Some(child)
            }
            Err(e) => {
                eprintln!("[kitawatch] failed to start {app}: {e}");
                None
            }
        }
    }

    fn spawn_node(dir: &PathBuf, script: &str, port: u16) -> Option<Child> {
        match Command::new("node")
            .arg(script)
            .env("PORT", port.to_string())
            .current_dir(dir)
            .spawn()
        {
            Ok(child) => {
                eprintln!("[kitawatch] started sidecar {script} on 127.0.0.1:{port}");
                Some(child)
            }
            Err(e) => {
                eprintln!("[kitawatch] failed to start {script}: {e}");
                None
            }
        }
    }

    pub fn start() -> Vec<(&'static str, Proc)> {
        let mut procs = Vec::new();

        if port_open("127.0.0.1:8000") {
            eprintln!("[kitawatch] Kuhi API already running on 127.0.0.1:8000");
        } else if let Some(dir) = find_dir("KITAWATCH_API_DIR", &["api/anime-api", "anime-api"]) {
            if let Some(c) = spawn_uvicorn(&dir, "api:app", 8000) {
                procs.push(("Kuhi API", Proc::Dev(c)));
            }
        } else {
            eprintln!("[kitawatch] Kuhi API not found — run `npm run setup:api`");
        }

        if port_open("127.0.0.1:8001") {
            eprintln!("[kitawatch] proxy already running on 127.0.0.1:8001");
        } else if let Some(dir) = find_dir("KITAWATCH_PROXY_DIR", &["proxy"]) {
            if let Some(c) = spawn_uvicorn(&dir, "server:app", 8001) {
                procs.push(("proxy", Proc::Dev(c)));
            }
        } else {
            eprintln!("[kitawatch] proxy/ not found");
        }

        if port_open("127.0.0.1:4000") {
            eprintln!("[kitawatch] Anivexa API already running on 127.0.0.1:4000");
        } else if let Some(dir) = find_dir("KITAWATCH_ANIVEXA_DIR", &["api/anivexa", "anivexa"]) {
            if dir.join("server.js").exists() {
                if let Some(c) = spawn_node(&dir, "server.js", 4000) {
                    procs.push(("Anivexa API", Proc::Dev(c)));
                }
            }
        } else {
            eprintln!("[kitawatch] Anivexa API not found — run `npm run setup:anivexa` to enable it");
        }

        procs
    }
}

#[cfg(not(debug_assertions))]
mod imp {
    use super::*;
    use tauri_plugin_shell::ShellExt;

    pub fn start(app: &tauri::AppHandle) -> Vec<(&'static str, Proc)> {
        let mut procs = Vec::new();
        for (name, bin, port) in [
            ("Kuhi API", "binaries/kuhi-api", 8000u16),
            ("proxy", "binaries/proxy", 8001),
            ("Anivexa API", "binaries/anivexa", 4000),
        ] {
            if port_open(&format!("127.0.0.1:{port}")) {
                eprintln!("[kitawatch] {name} already running on 127.0.0.1:{port}");
                continue;
            }
            match app.shell().sidecar(bin) {
                Ok(cmd) => match cmd.spawn() {
                    Ok((_rx, child)) => {
                        eprintln!("[kitawatch] started bundled sidecar {bin} on 127.0.0.1:{port}");
                        procs.push((name, Proc::Sidecar(child)));
                    }
                    Err(e) => eprintln!("[kitawatch] failed to start {bin}: {e}"),
                },
                Err(e) => eprintln!("[kitawatch] failed to start {bin}: {e}"),
            }
        }
        procs
    }
}

pub fn start(app: Option<&tauri::AppHandle>) -> Sidecars {
    #[cfg(debug_assertions)]
    let procs = imp::start();
    #[cfg(not(debug_assertions))]
    let procs = match app {
        Some(a) => imp::start(a),
        None => {
            eprintln!("[kitawatch] release build requires an AppHandle to spawn sidecars");
            Vec::new()
        }
    };
    Sidecars { procs }
}

pub fn stop(sidecars: &mut Sidecars) {
    for (name, proc) in std::mem::take(&mut sidecars.procs) {
        eprintln!("[kitawatch] stopping {name} sidecar");
        match proc {
            Proc::Dev(mut c) => {
                let _ = c.kill();
            }
            #[cfg(not(debug_assertions))]
            Proc::Sidecar(c) => {
                let _ = c.kill();
            }
        }
    }
}
