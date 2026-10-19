const COMMANDS: &[&str] = &["up", "down", "status"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
