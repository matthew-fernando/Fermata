use tauri::{Manager, tray::{TrayIconBuilder, TrayIconEvent}};

#[tauri::command]
fn update_tray_text(app: tauri::AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id("fermata-tray") {
        let _ = tray.set_title(Some(text));
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

// Manually trigger the OS native drag
#[tauri::command]
fn start_drag(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.start_dragging();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![update_tray_text, hide_window, start_drag])
        .setup(|app| {
            // Run as a menu bar only app (no Dock icon), like LSUIElement
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let mut tray_builder = TrayIconBuilder::with_id("fermata-tray")
                .title("Fermata"); 

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Swap .run() for .build().run() to intercept lifecycle events
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| {
            // Prevent the app from dying when the window is hidden
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}