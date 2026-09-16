//! Tauri commands.
//!
//! exchange_anilist_token: OAuth code exchange. Runs in Rust so the client
//! secret never ships in frontend code. Credentials come from environment
//! variables (.env in dev) and fall back to values supplied by the frontend
//! (the user's Settings) — the latter is what makes the installed app work,
//! where no .env exists.

use serde_json::json;

fn env_or(key: &str, fallback: Option<String>) -> String {
    std::env::var(key)
        .ok()
        .filter(|v| !v.is_empty())
        .or(fallback)
        .unwrap_or_default()
}

#[tauri::command]
pub async fn exchange_anilist_token(
    code: String,
    client_id: Option<String>,
    client_secret: Option<String>,
    redirect_uri: Option<String>,
) -> Result<String, String> {
    crate::config::load();

    let res = reqwest::Client::new()
        .post("https://anilist.co/api/v2/oauth/token")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&json!({
            "grant_type": "authorization_code",
            "client_id": env_or("ANILIST_CLIENT_ID", client_id),
            "client_secret": env_or("ANILIST_CLIENT_SECRET", client_secret),
            "redirect_uri": env_or("ANILIST_REDIRECT_URI", redirect_uri),
            "code": code,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("AniList responded {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    json["access_token"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "AniList returned no access_token".to_string())
}