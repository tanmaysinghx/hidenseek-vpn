//! Email/password sign-in and registration inside the app. The backend checks the credentials
//! with Portal and issues its own session: a 15-minute access token and a 30-day refresh token
//! that is replaced on every use, so a device that's used at least monthly stays signed in.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::oidc::{now, TokenKind, Tokens};
use crate::{Error, Result};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Issued {
    access_token: String,
    expires_in: u64,
    refresh_token: String,
}

#[derive(Deserialize)]
struct ApiError {
    code: Option<String>,
    message: Option<String>,
}

/// Registration either signs the person in, or Portal holds the new account for approval.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum RegisterOutcome {
    SignedIn,
    Pending { message: String },
}

pub struct Registration<'a> {
    pub email: &'a str,
    pub password: &'a str,
    pub first_name: &'a str,
    pub last_name: &'a str,
    pub device_name: &'a str,
}

fn endpoint(api_url: &str, action: &str) -> String {
    format!("{}/api/v1/public/auth/app/{action}", api_url.trim_end_matches('/'))
}

pub async fn login(http: &reqwest::Client, api_url: &str, email: &str, password: &str, device: &str) -> Result<Tokens> {
    let res = http
        .post(endpoint(api_url, "login"))
        .json(&json!({ "email": email.trim(), "password": password, "deviceName": device }))
        .send()
        .await?;
    issued(res).await
}

pub async fn register(http: &reqwest::Client, api_url: &str, r: Registration<'_>) -> Result<Option<Tokens>> {
    let res = http
        .post(endpoint(api_url, "register"))
        .json(&json!({
            "email": r.email.trim(), "password": r.password, "firstName": r.first_name.trim(),
            "lastName": r.last_name.trim(), "deviceName": r.device_name,
        }))
        .send()
        .await?;
    if res.status() == reqwest::StatusCode::ACCEPTED {
        return Ok(None);
    }
    issued(res).await.map(Some)
}

pub async fn refresh(http: &reqwest::Client, api_url: &str, refresh_token: &str) -> Result<Tokens> {
    let res = http.post(endpoint(api_url, "refresh")).json(&json!({ "refreshToken": refresh_token })).send().await?;
    issued(res).await
}

/// Best effort: the session is forgotten locally either way.
pub async fn logout(http: &reqwest::Client, api_url: &str, refresh_token: &str) {
    let _ = http.post(endpoint(api_url, "logout")).json(&json!({ "refreshToken": refresh_token })).send().await;
}

async fn issued(res: reqwest::Response) -> Result<Tokens> {
    let status = res.status();
    if !status.is_success() {
        let err: Option<ApiError> = res.json().await.ok();
        return Err(Error::Api {
            status: status.as_u16(),
            code: err.as_ref().and_then(|e| e.code.clone()),
            message: err.and_then(|e| e.message).unwrap_or_else(|| format!("Sign-in failed ({status})")),
        });
    }
    let body: Issued = res.json().await?;
    Ok(Tokens {
        access_token: body.access_token,
        refresh_token: Some(body.refresh_token),
        id_token: None,
        expires_at: now() + body.expires_in,
        kind: TokenKind::App,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// Answers each request with (status, body) chosen by its path.
    async fn backend(route: fn(&str) -> (u16, &'static str)) -> String {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut buf = vec![0u8; 8192];
                let n = socket.read(&mut buf).await.unwrap();
                let request = String::from_utf8_lossy(&buf[..n]).into_owned();
                let path = request.split_whitespace().nth(1).unwrap_or("").to_string();
                let (status, body) = route(&path);
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(reply.as_bytes()).await;
            }
        });
        format!("http://127.0.0.1:{port}")
    }

    const ISSUED: &str = r#"{"accessToken":"at","expiresIn":900,"refreshToken":"hsr_1","refreshExpiresIn":2592000,"email":"a@b.c","name":null}"#;

    #[tokio::test]
    async fn login_returns_an_app_session() {
        let api = backend(|_| (200, ISSUED)).await;
        let tokens = login(&reqwest::Client::new(), &api, "a@b.c", "pw", "Laptop").await.unwrap();
        assert_eq!(tokens.kind, TokenKind::App);
        assert_eq!(tokens.refresh_token.as_deref(), Some("hsr_1"));
        assert!(tokens.expires_at > now() + 800);
    }

    #[tokio::test]
    async fn wrong_password_surfaces_portals_message() {
        let api = backend(|_| (401, r#"{"code":"PRTL-1003","message":"Invalid email or password."}"#)).await;
        let err = login(&reqwest::Client::new(), &api, "a@b.c", "nope", "Laptop").await.unwrap_err();
        assert_eq!(err.to_string(), "Invalid email or password.");
    }

    #[tokio::test]
    async fn registration_can_be_pending() {
        let api = backend(|_| (202, r#"{"code":"HS-6003","message":"pending"}"#)).await;
        let reg = Registration { email: "a@b.c", password: "Str0ng-pass", first_name: "A", last_name: "", device_name: "Pixel" };
        assert!(register(&reqwest::Client::new(), &api, reg).await.unwrap().is_none());
    }

    #[test]
    fn older_saved_tokens_default_to_portal_sessions() {
        let saved = r#"{"accessToken":"x","refreshToken":null,"idToken":null,"expiresAt":1}"#;
        let tokens: Tokens = serde_json::from_str(saved).unwrap();
        assert_eq!(tokens.kind, TokenKind::Portal);
    }
}
