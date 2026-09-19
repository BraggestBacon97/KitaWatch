//! Tauri commands.
//!
//! exchange_anilist_token: OAuth code exchange. Runs in Rust so the client
//! secret never ships in frontend code. Credentials come from environment
//! variables (.env in dev) and fall back to values supplied by the frontend
//! (the user's Settings) — the latter is what makes the installed app work,
//! where no .env exists.
//!
//! collect_debug_report: one-click diagnostics for end users. Bundles sidecar
//! presence, port/HTTP probes, startup notes and recent sidecar logs into a
//! single paste-able string (Settings → "Copy debug report").

use serde_json::json;
use std::io::Read as _;
use std::net::TcpStream;
use std::time::Duration;

macro_rules! push {
    ($r:expr, $($arg:tt)*) => {{
        $r.push_str(&format!($($arg)*));
        $r.push('\n');
    }};
}

fn env_or(key: &str, fallback: Option<String>) -> String {
    std::env::var(key)
        .ok()
        .filter(|v| !v.is_empty())
        .or(fallback)
        .unwrap_or_default()
}

#[tauri::command]
pub async fn exchange_anilist_token(
    code: String,
    client_id: Option<String>,
    client_secret: Option<String>,
    redirect_uri: Option<String>,
) -> Result<String, String> {
    crate::config::load();

    let res = reqwest::Client::new()
        .post("https://anilist.co/api/v2/oauth/token")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&json!({
            "grant_type": "authorization_code",
            "client_id": env_or("ANILIST_CLIENT_ID", client_id),
            "client_secret": env_or("ANILIST_CLIENT_SECRET", client_secret),
            "redirect_uri": env_or("ANILIST_REDIRECT_URI", redirect_uri),
            "code": code,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("AniList responded {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    json["access_token"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "AniList returned no access_token".to_string())
}

/// Probe one local port: TCP connect + tiny HTTP GET (status + body prefix).
async fn probe(addr: &str, client: &reqwest::Client) -> String {
    let tcp = addr
        .parse()
        .ok()
        .and_then(|a| TcpStream::connect_timeout(&a, Duration::from_millis(500)).ok())
        .is_some();
    if !tcp {
        return format!("{addr}: CLOSED (nothing listening)");
    }
    let url = format!("http://{addr}/");
    match client.get(&url).send().await {
        Ok(res) => {
            let status = res.status();
            let ctype = res
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("?")
                .to_string();
            let body = res.text().await.unwrap_or_default();
            let preview: String = body.chars().filter(|c| *c != '\n').take(80).collect();
            format!("{addr}: OPEN — GET / -> {status} ({ctype}) body[:80]={preview:?}")
        }
        Err(e) => format!("{addr}: OPEN — but HTTP GET failed: {e}"),
    }
}

/// Tail the last `max_lines` of a log file.
fn tail(path: &std::path::Path, max_lines: usize) -> String {
    let Ok(mut f) = std::fs::File::open(path) else {
        return String::new();
    };
    let mut buf = Vec::new();
    let _ = f.read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf);
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

#[tauri::command]
pub async fn collect_debug_report(app: tauri::AppHandle) -> Result<String, String> {
    crate::config::load();
    let mut r = String::new();

    push!(r, "KitaWatch v{} — debug report", env!("CARGO_PKG_VERSION"));
    push!(
        r,
        "os={} arch={} debug_flag={}",
        std::env::consts::OS,
        std::env::consts::ARCH,
        crate::api_sidecar::debug_mode()
    );
    push!(r, "log_dir={}", crate::api_sidecar::log_dir(&app).display());
    r.push('\n');

    // --- bundled sidecar binaries next to the app exe ----------------------
    push!(r, "[sidecar binaries]");
    match std::env::current_exe() {
        Ok(mut exe) => {
            exe.pop();
            let ext = if cfg!(windows) { ".exe" } else { "" };
            for name in ["kitawatch-kuhi-api", "kitawatch-proxy", "kitawatch-anivexa"] {
                let mut found = None;
                for cand in [
                    exe.join(format!("{name}{ext}")),
                    exe.join(format!("{}-{}{}", name, crate::api_sidecar::SIDE_TRIPLE, ext)),
                ] {
                    if cand.exists() {
                        found = Some(cand);
                        break;
                    }
                }
                match found {
                    Some(p) => {
                        let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                        push!(r, "  {name}: FOUND ({}, {} bytes)", p.display(), size);
                    }
                    None => push!(r, "  {name}: MISSING next to {}", exe.display()),
                }
            }
        }
        Err(e) => push!(r, "  cannot resolve app exe path: {e}"),
    }
    r.push('\n');

    // --- port + HTTP probes --------------------------------------------------
    push!(r, "[port probes]");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|e| e.to_string())?;
    for addr in ["127.0.0.1:8000", "127.0.0.1:8001", "127.0.0.1:4000"] {
        push!(r, "  {}", probe(addr, &client).await);
    }
    r.push('\n');

    // --- startup notes (why a sidecar was not started) -----------------------
    let notes = crate::api_sidecar::startup_notes();
    push!(r, "[startup notes]");
    if notes.is_empty() {
        push!(r, "  (none — all sidecars spawned normally)");
    } else {
        for n in notes {
            push!(r, "  {n}");
        }
    }
    r.push('\n');

    // --- recent sidecar logs --------------------------------------------------
    push!(r, "[recent sidecar logs]");
    let dir = crate::api_sidecar::log_dir(&app);
    match std::fs::read_dir(&dir) {
        Ok(entries) => {
            let mut any = false;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|e| e == "log") {
                    any = true;
                    push!(r, "--- {} (last 60 lines) ---", path.display());
                    r.push_str(&tail(&path, 60));
                    r.push('\n');
                }
            }
            if !any {
                push!(r, "  (no .log files in {})", dir.display());
            }
        }
        Err(e) => push!(r, "  cannot read {}: {e}", dir.display()),
    }

    Ok(r)
}