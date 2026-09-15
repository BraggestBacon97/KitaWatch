mod api_sidecar;

#[tauri::command]
async fn exchange_anilist_token(
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
) -> Result<String, String> {
    println!("Rust: Received code: {}, client_id: {}, redirect_uri: {}", code, client_id, redirect_uri);
    let client = reqwest::Client::new();
    let res = client
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

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        println!("Rust: AniList API Error: {:?}", err);
        return Err(format!("Token exchange failed: {}", err));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    println!("Rust: Exchange success");
    json["access_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No access token in response".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
