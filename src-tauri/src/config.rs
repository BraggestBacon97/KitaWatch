use std::env;
use std::path::PathBuf;

fn try_load(path: &PathBuf) {
    if path.exists() {
        if dotenvy::from_path(path).is_ok() {
            eprintln!("[kitawatch] loaded .env from {}", path.display());
        }
    }
}

pub fn load() {
    // 1) Next to the executable (Windows installer, dev)
    if let Ok(mut p) = std::env::current_exe() {
        p.pop();
        p.push(".env");
        try_load(&p);
        // 1b) Linux bundle layouts: exe in /usr/bin, resources in /usr/lib/<app>/resources or ../lib/<app>
        //     Also check parent/resources/.env and exe/resources/.env
        for rel in ["resources/.env", "../lib/kitawatch/resources/.env", "../lib/com.kitawatch.app/resources/.env"] {
            if let Ok(mut exe) = std::env::current_exe() {
                exe.pop();
                let cand = exe.join(rel);
                try_load(&cand);
            }
        }
        // 1c) AppImage: resources next to squashfs mount -> check $APPDIR/resources
        if let Ok(appdir) = std::env::var("APPDIR") {
            try_load(&PathBuf::from(appdir.clone()).join("resources/.env"));
            try_load(&PathBuf::from(appdir).join(".env"));
        }
    }
    // 2) Tauri resource dir via env var set by some launchers
    if let Ok(res) = std::env::var("TAURI_RESOURCE_DIR") {
        try_load(&PathBuf::from(res).join(".env"));
    }
    // 3) Current working directory (cargo tauri dev)
    try_load(&PathBuf::from(".env"));
    try_load(&PathBuf::from("src-tauri/.env"));
    dotenvy::dotenv().ok();
}

/// Load .env from the Tauri resource directory (Linux AppImage/deb need this).
pub fn load_with_resource_dir(resource_dir: &std::path::Path) {
    try_load(&resource_dir.join(".env"));
    load();
}

pub fn get_var(key: &str) -> Result<String, String> {
    env::var(key).map_err(|_| format!("{} is not configured", key))
}