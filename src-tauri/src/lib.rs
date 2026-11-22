use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, Manager, RunEvent,
};

// Shows the window above everything else. Raising its level for a moment puts it
// on top even when macOS declines to activate a menu bar only app.
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let pinned = window.is_always_on_top().unwrap_or(false);
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
        let _ = window.set_always_on_top(pinned);
        // Lets the frontend catch up on anything it held back while hidden
        let _ = app.emit("window-shown", ());
    }
}

#[tauri::command]
fn update_tray_text(app: tauri::AppHandle, text: String, negative: bool) {
    if let Some(tray) = app.tray_by_id("fermata-tray") {
        let _ = tray.set_title(Some(text));
        #[cfg(target_os = "macos")]
        if negative {
            color_tray_title_red(&tray);
        }
    }
}

// Tauri only sets plain titles, so for a negative balance this swaps in a red
// title on the underlying status item, keeping the menu bar's own font.
// set_title above replaces it with plain text again on the next update.
#[cfg(target_os = "macos")]
fn color_tray_title_red(tray: &TrayIcon) {
    let _ = tray.with_inner_tray_icon(|inner| {
        use objc2::{runtime::AnyObject, AnyThread, MainThreadMarker};
        use objc2_app_kit::{NSColor, NSFontAttributeName, NSForegroundColorAttributeName};
        use objc2_foundation::{NSAttributedString, NSDictionary, NSString};

        let Some(mtm) = MainThreadMarker::new() else { return };
        let Some(button) = inner.ns_status_item().and_then(|item| item.button(mtm)) else { return };

        let color = NSColor::systemRedColor();
        let mut keys: Vec<&NSString> = vec![unsafe { NSForegroundColorAttributeName }];
        let mut values: Vec<&AnyObject> = vec![color.as_ref()];
        let font = button.font();
        if let Some(font) = &font {
            keys.push(unsafe { NSFontAttributeName });
            values.push(font.as_ref());
        }
        let attributes = NSDictionary::from_slices(&keys, &values);
        let title = unsafe {
            NSAttributedString::initWithString_attributes(NSAttributedString::alloc(), &button.title(), Some(&attributes))
        };
        button.setAttributedTitle(&title);
    });
}

// Menu bar images for each rest stage on the way to a long break.
// All are black on transparent so macOS can tint them as template images.
fn tray_image_bytes(stage: &str) -> &'static [u8] {
    match stage {
        "quarter" => include_bytes!("../icons/tray-quarter.png"),
        "half" => include_bytes!("../icons/tray-half.png"),
        "whole" => include_bytes!("../icons/tray-whole.png"),
        _ => include_bytes!("../icons/tray.png"),
    }
}

#[tauri::command]
fn set_tray_icon(app: tauri::AppHandle, stage: String) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("fermata-tray") {
        tray.set_icon(Some(Image::from_bytes(tray_image_bytes(&stage))?))?;
        // Replacing the image clears the template flag
        tray.set_icon_as_template(true)?;
    }
    Ok(())
}

#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, enabled: bool) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(enabled)?;
    }
    Ok(())
}

#[tauri::command]
fn bring_to_front(app: AppHandle) {
    show_main_window(&app);
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
            &MenuItem::with_id(&window, "how-it-works", "How It Works", true, None::<&str>)?,
            &MenuItem::with_id(&window, "updates", "Check for Updates…", true, None::<&str>)?,
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![update_tray_text, set_tray_icon, set_always_on_top, bring_to_front, hide_window, show_menu, quit_app, start_drag])
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => {
                let _ = app.emit("open-settings", ());
            }
            "how-it-works" => {
                let _ = app.emit("open-how-it-works", ());
            }
            "updates" => {
                let _ = app.emit("check-updates", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            // Run as a menu bar only app (no Dock icon), like LSUIElement
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // As a template image macOS tints it to match the menu bar in light and dark mode
            let tray_icon = Image::from_bytes(tray_image_bytes("fermata"))?;

            // Right-click menu; its "quit" item is handled in on_menu_event
            let tray_menu = Menu::with_items(
                app,
                &[&MenuItem::with_id(app, "quit", "Quit Fermata", true, None::<&str>)?],
            )?;

            TrayIconBuilder::with_id("fermata-tray")
                .title("Fermata")
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    // Left click opens the window; right click opens the menu
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Swap .run() for .build().run() to intercept lifecycle events
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| match event {
            RunEvent::Ready => show_main_window(app),
            // Opening the app again while it's already running in the menu bar
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_main_window(app),
            // Prevent the app from dying when the window is hidden.
            // Only app.exit() (menu Quit or Cmd+Q) carries an exit code, so it gets through.
            RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
            _ => {}
        });
}