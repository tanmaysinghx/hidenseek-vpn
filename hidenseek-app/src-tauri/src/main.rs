// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `hidenseek-app tunnel up|down`: the privileged tunnel helper, run through pkexec.
    #[cfg(target_os = "linux")]
    {
        let args: Vec<String> = std::env::args().skip(1).collect();
        if args.first().map(String::as_str) == Some(hidenseek_core::tunnel::HELPER_ARG) {
            std::process::exit(hidenseek_core::tunnel::helper_main(&args[1..]));
        }
    }
    hidenseek_app_lib::run()
}
