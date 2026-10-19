//! WireGuard keys. The private key is generated on the device and never leaves it.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use x25519_dalek::{PublicKey, StaticSecret};

use crate::{Error, Result};

pub struct KeyPair {
    pub private_key: String,
    pub public_key: String,
}

pub fn generate() -> Result<KeyPair> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| Error::Config(format!("no secure random source: {e}")))?;
    // Clamp like `wg genkey`, so the key round-trips through any WireGuard tool unchanged.
    bytes[0] &= 248;
    bytes[31] = (bytes[31] & 127) | 64;
    let secret = StaticSecret::from(bytes);
    Ok(KeyPair {
        private_key: STANDARD.encode(secret.to_bytes()),
        public_key: STANDARD.encode(PublicKey::from(&secret).as_bytes()),
    })
}

pub fn public_from_private(private_key: &str) -> Result<String> {
    let bytes: [u8; 32] = STANDARD
        .decode(private_key)
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or_else(|| Error::Config("stored private key is corrupt".into()))?;
    Ok(STANDARD.encode(PublicKey::from(&StaticSecret::from(bytes)).as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_keys_are_consistent() {
        let pair = generate().unwrap();
        assert_eq!(pair.private_key.len(), 44);
        assert_eq!(public_from_private(&pair.private_key).unwrap(), pair.public_key);
    }

    #[test]
    fn matches_rfc7748_vector() {
        // RFC 7748 §6.1, Alice's key pair, base64 encoded.
        let private = "dwdtCnMYpX08FsFyUbJmRd9ML4frwJkqsXf7pR25LCo=";
        assert_eq!(public_from_private(private).unwrap(), "hSDwCYkwp1R0i33ctD73Wg2/Og0mOBr066SpjqqbTmo=");
    }
}
