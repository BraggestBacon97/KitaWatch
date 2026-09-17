use std::env;

pub fn load() {
    // Prefer a .env sitting next to the executable (bundled with the installer),
    // then fall back to the current working directory (dev).
    if let Ok(mut p) = std::env::current_exe() {
        p.pop();
        p.push(".env");
        if p.exists() {
            dotenvy::from_path(&p).ok();
        }
    }
    dotenvy::dotenv().ok();
}

pub fn get_var(key: &str) -> Result<String, String> {
    env::var(key).map_err(|_| format!("{} is not configured", key))
}