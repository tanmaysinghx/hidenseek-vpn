//! Runs the Linux tunnel helper on its own, for testing it as root:
//! `sudo ./tunnel_helper up hidenseek.conf` / `sudo ./tunnel_helper down`.

fn main() {
    #[cfg(target_os = "linux")]
    {
        let args: Vec<String> = std::env::args().skip(1).collect();
        std::process::exit(hidenseek_core::tunnel::helper_main(&args));
    }
}
