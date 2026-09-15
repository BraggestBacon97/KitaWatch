mod api_sidecar;
mod config;

#[tauri::command]
async fn exchange_anilist_token(
    code: String,
) -> Result<String, String> {
    let client_id = config::get_var("ANILIST_CLIENT_ID")?;
    let client_secret = config::get_var("ANILIST_CLIENT_SECRET")?;
    let redirect_uri = config::get_var("ANILIST_REDIRECT_URI")?;

    let client = reqwest::Client::new();
    let response = client
        .post("https://anilist.co/api/v2/oauth/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("redirect_uri", &redirect_uri),
            ("code", &code),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!(
            "AniList token exchange failed ({}): {}",
            status, body
        ));
    }

    let json: serde_json::Value =
        serde_json::from_str(&body)
            .map_err(|e| format!("Invalid AniList response: {}", e))?;

    json["access_token"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "AniList response did not contain an access_token".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    config::load();
    let mut sidecars = api_sidecar::try_start();

    // single-instance MUST be the first plugin — with its "deep-link"
    // feature it forwards OAuth callbacks (kitawatch://auth) from the
    // second OS-spawned process into the running instance.
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));
    }

    builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init());

    builder
        .invoke_handler(tauri::generate_handler![exchange_anilist_token])
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building KitaWatch")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let s = &mut sidecars;
                for (name, slot) in [
                    ("Kuhi API", &mut s.api),
                    ("proxy", &mut s.proxy),
                    ("Anivexa API", &mut s.anivexa),
                ] {
                    if let Some(mut child) = slot.take() {
                        eprintln!("[kitawatch] stopping {name} sidecar");
                        let _ = child.kill();
                    }
                }
            }
        });
}
