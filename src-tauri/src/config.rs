use std::env;

pub fn load() {
    // Load .env file from the project root (where cargo.toml is)
    // Note: Tauri's working directory might differ in dev vs prod,
    // so we try to find it relative to the executable if needed.
    dotenvy::dotenv().ok();
}

pub fn get_var(key: &str) -> Result<String, String> {
    env::var(key).map_err(|_| format!("{} is not configured. Please create a .env file based on .env.example.", key))
}
