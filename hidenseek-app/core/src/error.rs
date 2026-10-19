use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("{message}")]
    Api { status: u16, code: Option<String>, message: String },
    #[error("You are signed out. Please sign in again.")]
    NotSignedIn,
    #[error("Sign-in failed: {0}")]
    Auth(String),
    #[error("{0}")]
    Tunnel(String),
    #[error("{0}")]
    Config(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl Error {
    pub fn is_not_found(&self) -> bool {
        matches!(self, Error::Api { status: 404, .. })
    }
}

/// Errors cross into the UI as `{ kind, message }`.
impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let kind = match self {
            Error::NotSignedIn => "signedOut",
            Error::Api { .. } => "api",
            Error::Http(_) => "network",
            Error::Tunnel(_) => "tunnel",
            _ => "other",
        };
        let mut s = serializer.serialize_struct("Error", 2)?;
        s.serialize_field("kind", kind)?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}
