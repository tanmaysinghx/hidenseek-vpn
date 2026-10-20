//! Portal SSO sign-in: OAuth 2.1 authorization code + PKCE (S256) through the system browser,
//! with the redirect caught on a loopback address as RFC 8252 recommends for native apps.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use url::Url;

use crate::{Error, Result};

/// Register `http://127.0.0.1:47863/callback` on the Portal OAuth client. If that port is busy
/// the app falls back to a random one, which Portal accepts for loopback IPs (RFC 8252 §7.3).
pub const PREFERRED_PORT: u16 = 47863;
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalConfig {
    pub portal_url: String,
    pub client_id: String,
    pub scopes: String,
    /// The backend redeems codes and refresh tokens with the client secret (confidential client).
    #[serde(default)]
    pub token_broker: bool,
    /// The backend offers email/password sign-in and registration (Portal's external API).
    #[serde(default)]
    pub password_login: bool,
}

/// Where tokens are redeemed: Portal directly (public client) or the backend's broker.
pub enum TokenEndpoint<'a> {
    Portal,
    Broker { api_url: &'a str },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    /// Unix seconds.
    pub expires_at: u64,
    /// Which sign-in produced these, and so where to refresh them.
    #[serde(default)]
    pub kind: TokenKind,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TokenKind {
    /// Portal SSO through the browser (refreshed at Portal or the backend's broker).
    #[default]
    Portal,
    /// Email and password in the app (refreshed at the backend's app-session endpoint).
    App,
}

impl Tokens {
    pub fn expires_soon(&self) -> bool {
        now() + 30 >= self.expires_at
    }
}

#[derive(Deserialize)]
struct Discovery {
    authorization_endpoint: String,
    token_endpoint: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    expires_in: Option<u64>,
}

#[derive(Deserialize)]
struct OAuthError {
    error: String,
    error_description: Option<String>,
}

pub fn endpoint_for<'a>(portal: &PortalConfig, api_url: &'a str) -> TokenEndpoint<'a> {
    if portal.token_broker {
        TokenEndpoint::Broker { api_url }
    } else {
        TokenEndpoint::Portal
    }
}

pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

pub fn pkce() -> Result<Pkce> {
    let verifier = random_token(32)?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    Ok(Pkce { verifier, challenge })
}

fn random_token(len: usize) -> Result<String> {
    let mut bytes = vec![0u8; len];
    getrandom::fill(&mut bytes).map_err(|e| Error::Auth(format!("no secure random source: {e}")))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub(crate) fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

async fn discover(http: &reqwest::Client, portal: &PortalConfig) -> Result<Discovery> {
    let url = format!("{}/.well-known/openid-configuration", portal.portal_url.trim_end_matches('/'));
    Ok(http.get(url).send().await?.error_for_status()?.json().await?)
}

/// Runs the whole browser sign-in. `open_browser` is given the authorization URL to show.
pub async fn login(
    http: &reqwest::Client,
    portal: &PortalConfig,
    endpoint: TokenEndpoint<'_>,
    open_browser: impl FnOnce(&str) -> Result<()>,
) -> Result<Tokens> {
    let discovery = discover(http, portal).await?;
    let listener = match TcpListener::bind(("127.0.0.1", PREFERRED_PORT)).await {
        Ok(l) => l,
        Err(_) => TcpListener::bind(("127.0.0.1", 0)).await?,
    };
    let redirect_uri = format!("http://127.0.0.1:{}/callback", listener.local_addr()?.port());
    let pkce = pkce()?;
    let state = random_token(16)?;

    let mut url = Url::parse(&discovery.authorization_endpoint).map_err(|e| Error::Auth(e.to_string()))?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &portal.client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", &portal.scopes)
        .append_pair("state", &state)
        .append_pair("code_challenge", &pkce.challenge)
        .append_pair("code_challenge_method", "S256");
    open_browser(url.as_str())?;

    let code = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_code(&listener, &state))
        .await
        .map_err(|_| Error::Auth("timed out waiting for the browser".into()))??;

    let request = match endpoint {
        TokenEndpoint::Broker { api_url } => http
            .post(format!("{}/api/v1/public/auth/token", api_url.trim_end_matches('/')))
            .json(&serde_json::json!({ "code": code, "codeVerifier": pkce.verifier, "redirectUri": redirect_uri })),
        TokenEndpoint::Portal => http.post(&discovery.token_endpoint).form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("client_id", portal.client_id.as_str()),
            ("code_verifier", pkce.verifier.as_str()),
        ]),
    };
    token_request(request).await
}

pub async fn refresh(
    http: &reqwest::Client,
    portal: &PortalConfig,
    endpoint: TokenEndpoint<'_>,
    refresh_token: &str,
) -> Result<Tokens> {
    let request = match endpoint {
        TokenEndpoint::Broker { api_url } => http
            .post(format!("{}/api/v1/public/auth/refresh", api_url.trim_end_matches('/')))
            .json(&serde_json::json!({ "refreshToken": refresh_token })),
        TokenEndpoint::Portal => {
            let discovery = discover(http, portal).await?;
            http.post(discovery.token_endpoint).form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
                ("client_id", portal.client_id.as_str()),
            ])
        }
    };
    let mut tokens = token_request(request).await?;
    // Portal rotates refresh tokens; keep the old one only if a new one wasn't issued.
    tokens.refresh_token.get_or_insert_with(|| refresh_token.to_string());
    Ok(tokens)
}

async fn token_request(request: reqwest::RequestBuilder) -> Result<Tokens> {
    let res = request.send().await?;
    if !res.status().is_success() {
        let err: Option<OAuthError> = res.json().await.ok();
        return Err(Error::Auth(match err {
            Some(e) => e.error_description.unwrap_or(e.error),
            None => "token request rejected".into(),
        }));
    }
    let body: TokenResponse = res.json().await?;
    Ok(Tokens {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        id_token: body.id_token,
        expires_at: now() + body.expires_in.unwrap_or(900),
        kind: TokenKind::Portal,
    })
}

/// Serves the loopback redirect until it receives a matching callback.
async fn wait_for_code(listener: &TcpListener, expected_state: &str) -> Result<String> {
    loop {
        let (mut socket, _) = listener.accept().await?;
        let mut buf = vec![0u8; 8192];
        let n = socket.read(&mut buf).await?;
        let request = String::from_utf8_lossy(&buf[..n]);
        let target = request.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("");
        let Ok(url) = Url::parse(&format!("http://127.0.0.1{target}")) else { continue };
        if url.path() != "/callback" {
            let _ = socket.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
            continue;
        }
        let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.into_owned());
        let result = match (param("state"), param("code"), param("error")) {
            (_, _, Some(error)) => Err(Error::Auth(param("error_description").unwrap_or(error))),
            (Some(state), Some(code), None) if state == expected_state => Ok(code),
            _ => Err(Error::Auth("the sign-in response did not match this request".into())),
        };
        let page = callback_page(result.is_ok());
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            page.len(),
            page
        );
        let _ = socket.write_all(response.as_bytes()).await;
        return result;
    }
}

fn callback_page(ok: bool) -> String {
    let (title, message) = if ok {
        ("Signed in", "You're signed in to Hidenseek VPN. You can close this tab and return to the app.")
    } else {
        ("Sign-in failed", "Something went wrong. Return to the app and try again.")
    };
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f17;color:#e6edf6;font:16px system-ui,sans-serif}}
main{{max-width:28rem;padding:2rem;text-align:center}}h1{{font-size:1.4rem;margin:0 0 .5rem}}p{{color:#93a1b5;line-height:1.5}}</style>
</head><body><main><h1>{title}</h1><p>{message}</p></main><script>setTimeout(()=>window.close(),1500)</script></body></html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_s256_of_verifier() {
        let p = pkce().unwrap();
        assert_eq!(p.challenge, URL_SAFE_NO_PAD.encode(Sha256::digest(p.verifier.as_bytes())));
        assert!(p.verifier.len() >= 43);
    }

    /// Minimal HTTP server: answers each request with `respond(request_text)`, recording requests.
    async fn fake_server(
        respond: fn(&str, u16) -> String,
    ) -> (String, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = seen.clone();
        tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut buf = vec![0u8; 16384];
                let n = socket.read(&mut buf).await.unwrap();
                let request = String::from_utf8_lossy(&buf[..n]).into_owned();
                let body = respond(&request, port);
                log.lock().unwrap().push(request);
                let res = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = socket.write_all(res.as_bytes()).await;
            }
        });
        (format!("http://127.0.0.1:{port}"), seen)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn broker_login_sends_code_and_verifier_to_backend() {
        let (base, seen) = fake_server(|req, port| {
            if req.starts_with("GET /.well-known/openid-configuration") {
                format!(
                    r#"{{"authorization_endpoint":"http://127.0.0.1:{port}/oauth2/authorize","token_endpoint":"http://127.0.0.1:{port}/oauth2/token"}}"#
                )
            } else {
                r#"{"access_token":"at","refresh_token":"rt","expires_in":900}"#.to_string()
            }
        })
        .await;
        let portal = PortalConfig {
            portal_url: base.clone(),
            client_id: "hidenseek-vpn".into(),
            scopes: "openid profile email".into(),
            token_broker: true,
            password_login: false,
        };
        let http = reqwest::Client::new();
        // Plays the browser: Portal "approves" and redirects back to the loopback listener.
        let browser = |auth_url: &str| {
            let url = Url::parse(auth_url).unwrap();
            let q = |k: &str| url.query_pairs().find(|(n, _)| n == k).unwrap().1.into_owned();
            assert_eq!(q("code_challenge_method"), "S256");
            let redirect = format!("{}?code=the-code&state={}", q("redirect_uri"), q("state"));
            tokio::spawn(async move { reqwest::get(redirect).await.unwrap() });
            Ok(())
        };
        let tokens = login(&http, &portal, TokenEndpoint::Broker { api_url: &base }, browser).await.unwrap();
        assert_eq!(tokens.access_token, "at");
        assert_eq!(tokens.refresh_token.as_deref(), Some("rt"));

        let requests = seen.lock().unwrap();
        let exchange = requests.iter().find(|r| r.starts_with("POST /api/v1/public/auth/token")).unwrap();
        assert!(exchange.contains(r#""code":"the-code""#));
        assert!(exchange.contains(r#""codeVerifier":""#));
        assert!(!requests.iter().any(|r| r.starts_with("POST /oauth2/token")), "must not call Portal directly");
    }

    #[tokio::test]
    async fn loopback_accepts_matching_state_only() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move { wait_for_code(&listener, "good").await });
        let http = reqwest::Client::new();
        let _ = http.get(format!("http://127.0.0.1:{port}/favicon.ico")).send().await;
        let res = http.get(format!("http://127.0.0.1:{port}/callback?code=abc&state=good")).send().await.unwrap();
        assert!(res.text().await.unwrap().contains("Signed in"));
        assert_eq!(server.await.unwrap().unwrap(), "abc");

        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move { wait_for_code(&listener, "good").await });
        let _ = http.get(format!("http://127.0.0.1:{port}/callback?code=abc&state=forged")).send().await;
        assert!(server.await.unwrap().is_err());
    }
}
