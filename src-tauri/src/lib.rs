mod api_sidecar;

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
