function bytes(value: string): Uint8Array { return new TextEncoder().encode(value); }
function source(value: Uint8Array): BufferSource { return value as unknown as BufferSource; }
function base64Url(value: Uint8Array): string { return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""); }
function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError("Invalid key encoding.");
  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
async function key(encoded: string, usage: KeyUsage[]): Promise<CryptoKey> {
  const raw = decodeBase64Url(encoded);
  if (raw.length !== 32) throw new TypeError("Google proof key must be 256 bits.");
  return crypto.subtle.importKey("raw", source(raw), "AES-GCM", false, usage);
}
async function digest(value: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", source(bytes(value))))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

export interface GoogleProofKey { version: string; material: string; }
export interface GoogleProofCryptoConfiguration { encryption: GoogleProofKey; subjectHmac: GoogleProofKey; }

/** Bind separately purposed server keys and reject accidental key reuse. */
export function createGoogleProofCryptoConfiguration(configuration: GoogleProofCryptoConfiguration): GoogleProofCryptoConfiguration {
  if (!configuration.encryption.version.trim() || !configuration.subjectHmac.version.trim()) throw new TypeError("Google proof key versions are required.");
  if (configuration.encryption.material === configuration.subjectHmac.material) throw new TypeError("Google proof encryption and subject HMAC keys must differ.");
  return configuration;
}

function aad(intent: { stateDigest: string; userId: string; sessionId: string; action: string; lifecycleGeneration: number }): Uint8Array {
  return bytes([intent.stateDigest, intent.userId, intent.sessionId, intent.action, String(intent.lifecycleGeneration)].join("\u0000"));
}
/** AES-GCM protects a PKCE verifier and binds it to the original account intent. */
export async function encryptGoogleProofVerifier(verifier: string, intent: { stateDigest: string; userId: string; sessionId: string; action: string; lifecycleGeneration: number }, encryption: GoogleProofKey): Promise<string> {
  if (verifier.length < 43 || verifier.length > 128) throw new TypeError("Invalid PKCE verifier.");
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: source(nonce), additionalData: source(aad(intent)) }, await key(encryption.material, ["encrypt"]), source(bytes(verifier))));
  return `${base64Url(nonce)}.${base64Url(encrypted)}`;
}
export async function decryptGoogleProofVerifier(ciphertext: string, intent: { stateDigest: string; userId: string; sessionId: string; action: string; lifecycleGeneration: number }, encryption: GoogleProofKey): Promise<string | null> {
  try {
    const [nonce, encrypted, extra] = ciphertext.split(".");
    if (!nonce || !encrypted || extra) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: source(decodeBase64Url(nonce)), additionalData: source(aad(intent)) }, await key(encryption.material, ["decrypt"]), source(decodeBase64Url(encrypted)));
    const verifier = new TextDecoder().decode(plain);
    return verifier.length >= 43 && verifier.length <= 128 ? verifier : null;
  } catch { return null; }
}
/** Subject digest uses a separate HMAC key, never the encryption key. */
export async function digestGoogleProofSubject(subject: string, hmac: GoogleProofKey): Promise<string> {
  if (!/^[\x21-\x7e]{1,255}$/u.test(subject)) throw new TypeError("Invalid provider subject.");
  const raw = decodeBase64Url(hmac.material);
  if (raw.length !== 32) throw new TypeError("Google proof key must be 256 bits.");
  const hmacKey = await crypto.subtle.importKey("raw", source(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, source(bytes(subject))))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export { digest as digestGoogleProofSecret };
