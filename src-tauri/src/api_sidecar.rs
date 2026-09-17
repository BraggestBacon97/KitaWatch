//! Sidecars.
//!
//! - Debug builds: spawn from local source checkouts (api/anime-api, proxy,
//!   api/anivexa) so `git pull` in those folders takes effect immediately.
//! - Release builds: spawn the bundled binaries next to the app exe.
//!   Python sidecars are PyInstaller --noconsole builds (no window).
//!   Anivexa is spawned via std::process with CREATE_NO_WINDOW because
//!   tauri's sidecar() cannot pass window-creation flags and pkg always
//!   produces a console binary.
//!
//! The frontend talks to 127.0.0.1 — this only keeps the local
//! instances alive and reaps them on exit.

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Child;
use std::time::Duration;

pub enum Proc {
    Dev(Child),
    #[cfg(not(debug_assertions))]
    Bundled(Child),
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

/// Target-triple suffix used by the sidecar build script (build:sidecars).
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const SIDE_TRIPLE: &str = "x86_64-pc-windows-msvc";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const SIDE_TRIPLE: &str = "x86_64-unknown-linux-gnu";

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
    use std::process::Command;

    /// Resolve a bundled sidecar exe living next to the app binary.
    fn bundled_exe(name: &str) -> Option<PathBuf> {
        let mut exe = std::env::current_exe().ok()?;
        exe.pop(); // drop kitawatch.exe -> install dir
        let file = format!(
            "{name}-{SIDE_TRIPLE}{}",
            if cfg!(windows) { ".exe" } else { "" }
        );
        let path = exe.join(&file);
        if path.exists() {
            Some(path)
        } else {
            eprintln!("[kitawatch] bundled sidecar missing: {file}");
            None
        }
    }

    fn spawn_hidden(cmd: &mut Command) -> Option<Child> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        match cmd.spawn() {
            Ok(child) => Some(child),
            Err(e) => {
                eprintln!("[kitawatch] failed to spawn sidecar: {e}");
                None
            }
        }
    }

    pub fn start() -> Vec<(&'static str, Proc)> {
        let mut procs = Vec::new();

        if !port_open("127.0.0.1:8000") {
            if let Some(exe) = bundled_exe("kuhi-api") {
                if let Some(c) = spawn_hidden(Command::new(exe)) {
                    eprintln!("[kitawatch] started bundled kuhi-api on 127.0.0.1:8000");
                    procs.push(("Kuhi API", Proc::Bundled(c)));
                }
            }
        } else {
            eprintln!("[kitawatch] Kuhi API already running on 127.0.0.1:8000");
        }

        if !port_open("127.0.0.1:8001") {
            if let Some(exe) = bundled_exe("proxy") {
                if let Some(c) = spawn_hidden(Command::new(exe)) {
                    eprintln!("[kitawatch] started bundled proxy on 127.0.0.1:8001");
                    procs.push(("proxy", Proc::Bundled(c)));
                }
            }
        } else {
            eprintln!("[kitawatch] proxy already running on 127.0.0.1:8001");
        }

        if !port_open("127.0.0.1:4000") {
            if let Some(exe) = bundled_exe("anivexa") {
                if let Some(c) = spawn_hidden(Command::new(exe).env("PORT", "4000")) {
                    eprintln!("[kitawatch] started bundled anivexa on 127.0.0.1:4000");
                    procs.push(("Anivexa API", Proc::Bundled(c)));
                }
            }
        } else {
            eprintln!("[kitawatch] Anivexa API already running on 127.0.0.1:4000");
        }

        procs
    }
}

pub fn start() -> Sidecars {
    let procs = imp::start();
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
            Proc::Bundled(mut c) => {
                let _ = c.kill();
            }
        }
    }
}
