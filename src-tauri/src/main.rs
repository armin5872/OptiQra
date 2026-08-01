// OptiQra desktop shell.
//
// This process does NOT reimplement the audit/crawl/fix engine in Rust.
// It spawns the existing Next.js app (built with `output: "standalone"`
// and packaged into a single executable via the sidecar binary at
// `binaries/optiqra-server`) as a background child process, points the
// webview at it, and keeps that process alive in the system tray even
// after the window is closed — which is the actual feature being asked
// for: scheduled scans that fire without a browser tab open.
//
// The scheduler loop itself should run INSIDE the sidecar process (see
// server/README.md), not here in Rust, since it needs the same
// audit/crawl code the rest of the app uses.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

fn main() {
    tauri::Builder::default()
        // Prevents a second OptiQra process from spawning a second sidecar
        // (and a second scheduler) if the user double-clicks the app again.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::sync_schedule,
            commands::delete_synced_schedule,
            commands::list_synced_scans,
            commands::read_synced_scan,
        ])
        .setup(|app| {
            // Resolved once, passed to the sidecar below AND used by every
            // command in commands.rs — this is what keeps Rust's file
            // writes and the sidecar's Node file writes pointed at the
            // exact same directory instead of two different OS-default
            // locations.
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("couldn't resolve app data dir");
            std::fs::create_dir_all(&data_dir).ok();

            // --- Spawn the Next.js standalone server as a sidecar ---
            // This is the same server that runs the /api/analyze,
            // /api/auto-fix-project, scheduler, etc. Nothing about the
            // audit engine changes; it just runs locally instead of on
            // Vercel.
            let shell = app.handle().shell();
            let (mut rx, _child) = shell
                .sidecar("optiqra-server")
                .expect("failed to create sidecar command")
                .env("PORT", "4173")
                .env("OPTIQRA_DESKTOP", "1")
                .env("OPTIQRA_DATA_DIR", data_dir.to_string_lossy().to_string())
                .spawn()
                .expect("failed to spawn optiqra-server sidecar");

            // Pipe sidecar stdout/stderr into the Tauri log so scan/schedule
            // activity is visible with `tauri dev` or in a log file in prod.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[optiqra-server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[optiqra-server] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });

            // --- Tray icon: keeps the scheduler alive after the window closes ---
            let show = MenuItem::with_id(app, "show", "Open OptiQra", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit OptiQra", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        // This is the ONLY path that actually kills the sidecar
                        // and exits — the window close button does not.
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        // Closing the window hides it instead of quitting the app, so the
        // sidecar (and therefore the schedule checker) keeps running.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running OptiQra");
}
