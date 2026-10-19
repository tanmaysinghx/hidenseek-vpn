//! Backend client. Attaches the Portal access token, refreshing it when it is about to expire.

use std::sync::Arc;
use std::time::Duration;

use reqwest::{Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::oidc::{self, PortalConfig};
use crate::store::Store;
use crate::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelConfig {
    pub node_id: String,
    pub node_name: String,
    pub country_code: String,
    pub address: String,
    pub dns: Vec<String>,
    pub server_public_key: String,
    pub endpoint: String,
    pub allowed_ips: Vec<String>,
    pub persistent_keepalive: u16,
    pub activity_logging: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub id: String,
}

#[derive(Deserialize)]
struct ApiError {
    code: Option<String>,
    message: Option<String>,
}

pub struct Api {
    http: reqwest::Client,
    store: Arc<Store>,
}

impl Api {
    pub fn new(store: Arc<Store>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent(concat!("hidenseek-app/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("HTTP client");
        Self { http, store }
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    /// Reads the backend's public config: which Portal to sign in with.
    pub async fn discover(&self, api_url: &str) -> Result<PortalConfig> {
        let url = format!("{}/api/v1/public/config", api_url.trim_end_matches('/'));
        let res = self.http.get(url).send().await?;
        if !res.status().is_success() {
            return Err(Error::Config(format!("{api_url} is not a Hidenseek server ({})", res.status())));
        }
        Ok(res.json().await?)
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        self.call(Method::GET, path, None).await
    }

    pub async fn post<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T> {
        self.call(Method::POST, path, Some(body)).await
    }

    pub async fn call<T: DeserializeOwned>(&self, method: Method, path: &str, body: Option<Value>) -> Result<T> {
        let value = self.request(method, path, body).await?;
        Ok(serde_json::from_value(value)?)
    }

    /// Sends an authenticated request; empty responses come back as `null`.
    pub async fn request(&self, method: Method, path: &str, body: Option<Value>) -> Result<Value> {
        if !path.starts_with("/api/") {
            return Err(Error::Config(format!("refusing to call {path}")));
        }
        let mut token = self.access_token(false).await?;
        for attempt in 0..2 {
            let base = self.store.get().api_url.ok_or_else(|| Error::Config("no server configured".into()))?;
            let mut req = self
                .http
                .request(method.clone(), format!("{}{}", base.trim_end_matches('/'), path))
                .bearer_auth(&token);
            if let Some(body) = &body {
                req = req.json(body);
            }
            let res = req.send().await?;
            let status = res.status();
            if status == StatusCode::UNAUTHORIZED && attempt == 0 {
                token = self.access_token(true).await?;
                continue;
            }
            if status == StatusCode::UNAUTHORIZED {
                self.sign_out()?;
                return Err(Error::NotSignedIn);
            }
            let text = res.text().await?;
            if !status.is_success() {
                let err: Option<ApiError> = serde_json::from_str(&text).ok();
                return Err(Error::Api {
                    status: status.as_u16(),
                    code: err.as_ref().and_then(|e| e.code.clone()),
                    message: err.and_then(|e| e.message).unwrap_or_else(|| format!("Server returned {status}")),
                });
            }
            return Ok(if text.is_empty() { Value::Null } else { serde_json::from_str(&text)? });
        }
        unreachable!()
    }

    async fn access_token(&self, force_refresh: bool) -> Result<String> {
        let state = self.store.get();
        let tokens = state.tokens.ok_or(Error::NotSignedIn)?;
        if !force_refresh && !tokens.expires_soon() {
            return Ok(tokens.access_token);
        }
        let (Some(refresh), Some(portal), Some(api_url)) =
            (tokens.refresh_token.as_deref(), state.portal.as_ref(), state.api_url.as_deref())
        else {
            self.sign_out()?;
            return Err(Error::NotSignedIn);
        };
        match oidc::refresh(&self.http, portal, oidc::endpoint_for(portal, api_url), refresh).await {
            Ok(fresh) => {
                let access = fresh.access_token.clone();
                self.store.update(|s| s.tokens = Some(fresh))?;
                Ok(access)
            }
            Err(Error::Http(e)) => Err(Error::Http(e)),
            Err(_) => {
                self.sign_out()?;
                Err(Error::NotSignedIn)
            }
        }
    }

    fn sign_out(&self) -> Result<()> {
        self.store.update(|s| s.tokens = None)?;
        Ok(())
    }
}
