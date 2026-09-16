mod api_sidecar;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // single-instance MUST be the first plugin — with its "deep-link"
        // feature it forwards OAuth callbacks (kitawatch://auth) from the
        // second OS-spawned process into the running instance.
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));
    }

    builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init());

    builder
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            // Debug builds spawn from source checkouts; release spawns the
            // bundled externalBin sidecars.
            #[cfg(debug_assertions)]
            let sidecars = api_sidecar::start(None);
            #[cfg(not(debug_assertions))]
            let sidecars = api_sidecar::start(Some(app.handle()));

            app.manage(std::sync::Mutex::new(sidecars));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building KitaWatch")
        .run(move |app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(mutex) = app_handle.try_state::<std::sync::Mutex<api_sidecar::Sidecars>>() {
                    if let Ok(mut sidecars) = mutex.lock() {
                        api_sidecar::stop(&mut sidecars);
                    }
                }
            }
        });
}
