use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, LogicalPosition, Manager,
};

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

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// Native popup menu for the three dots button. Clicks are handled in
// the builder's on_menu_event, not here.
#[tauri::command]
fn show_menu(window: tauri::Window, x: f64, y: f64) -> tauri::Result<()> {
    let menu = Menu::with_items(
        &window,
        &[
            // Accelerators here only label the shortcuts; the keys themselves
            // are handled by the frontend's keydown listener
            &MenuItem::with_id(&window, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(&window)?,
            &MenuItem::with_id(&window, "quit", "Quit Fermata", true, Some("CmdOrCtrl+Q"))?,
        ],
    )?;
    window.popup_menu_at(&menu, LogicalPosition::new(x, y))
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
        .invoke_handler(tauri::generate_handler![update_tray_text, hide_window, show_menu, quit_app, start_drag])
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => {
                let _ = app.emit("open-settings", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .setup(|app| {
            // Run as a menu bar only app (no Dock icon), like LSUIElement
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Black fermata on transparent; as a template image macOS tints it
            // to match the menu bar in light and dark mode
            let tray_icon = Image::from_bytes(include_bytes!("../icons/tray.png"))?;

            TrayIconBuilder::with_id("fermata-tray")
                .title("Fermata")
                .icon(tray_icon)
                .icon_as_template(true)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            // The frontend pauses the timer on reopen
                            let _ = app.emit("window-shown", ());
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
            // Prevent the app from dying when the window is hidden.
            // Only app.exit() (menu Quit or Cmd+Q) carries an exit code, so it gets through.
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}