//! Dev sidecars: Kuhi API (8000, python) + KitaWatch proxy (8001, python)
//! + Anivexa-API (4000, node).
//!
//! If nothing is listening on the port and a local copy exists, spawn it
//! and reap it on exit. The frontend controls *which* URL it talks to via
//! Settings — this only keeps the default local instances alive.

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::time::Duration;

pub struct Sidecars {
    pub api: Option<Child>,
    pub proxy: Option<Child>,
    pub anivexa: Option<Child>,
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

/// Find a local repo dir: env override, then candidates relative to CWD
/// (Cargo sets CWD to src-tauri during `tauri dev`).
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

fn spawn_uvicorn(dir: &PathBuf, app: &str, port: u16) -> Option<Child> {
    match Command::new(python())
        .args([
            "-m",
            "uvicorn",
            app,
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
        ])
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

pub fn try_start() -> Sidecars {
    let api = if port_open("127.0.0.1:8000") {
        eprintln!("[kitawatch] Kuhi API already running on 127.0.0.1:8000");
        None
    } else {
        match find_dir("KITAWATCH_API_DIR", &["api/anime-api", "anime-api"]) {
            Some(dir) => spawn_uvicorn(&dir, "api:app", 8000),
            None => {
                eprintln!("[kitawatch] Kuhi API not found - run `npm run setup:api` or point Settings at a deployed instance.");
                None
            }
        }
    };

    let proxy = if port_open("127.0.0.1:8001") {
        eprintln!("[kitawatch] proxy already running on 127.0.0.1:8001");
        None
    } else {
        match find_dir("KITAWATCH_PROXY_DIR", &["proxy"]) {
            Some(dir) => spawn_uvicorn(&dir, "server:app", 8001),
            None => {
                eprintln!("[kitawatch] proxy/ not found - animepahe and proxied sources unavailable.");
                None
            }
        }
    };

    let anivexa = if port_open("127.0.0.1:4000") {
        eprintln!("[kitawatch] Anivexa API already running on 127.0.0.1:4000");
        None
    } else {
        match find_dir("KITAWATCH_ANIVEXA_DIR", &["api/anivexa", "anivexa"]) {
            Some(dir) if dir.join("server.js").exists() => spawn_node(&dir, "server.js", 4000),
            _ => {
                eprintln!("[kitawatch] Anivexa API not found - run `npm run setup:anivexa` to enable it.");
                None
            }
        }
    };

    Sidecars { api, proxy, anivexa }
}
