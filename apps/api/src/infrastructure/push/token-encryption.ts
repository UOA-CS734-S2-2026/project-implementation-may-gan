export interface PushTokenCiphertext {
  ciphertext: string;
  keyVersion: string;
}

export interface PushTokenProtector {
  encrypt(token: string): Promise<PushTokenCiphertext>;
  decrypt(value: PushTokenCiphertext): Promise<string | null>;
}

const version = "v1";
const keyVersion = "worker-secret-v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Returns no adapter when the deployment has no valid key. Callers must leave
 * push registration and delivery disabled in that state, rather than falling
 * back to plaintext storage.
 */
export function hasWorkerPushTokenProtection(secret: string | undefined): boolean {
  return decodeBase64(secret)?.byteLength === 32;
}

export async function createWorkerPushTokenProtector(secret: string | undefined): Promise<PushTokenProtector | undefined> {
  const bytes = decodeBase64(secret);
  if (!bytes || bytes.byteLength !== 32) return undefined;
  const key = await crypto.subtle.importKey("raw", arrayBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return {
    async encrypt(token) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: arrayBuffer(iv) }, key, arrayBuffer(encoder.encode(token)));
      return { ciphertext: `${version}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`, keyVersion };
    },
    async decrypt(value) {
      if (value.keyVersion !== keyVersion) return null;
      const parts = value.ciphertext.split(".");
      if (parts.length !== 3 || parts[0] !== version) return null;
      const iv = fromBase64Url(parts[1]!);
      const ciphertext = fromBase64Url(parts[2]!);
      if (!iv || iv.byteLength !== 12 || !ciphertext) return null;
      try {
        return decoder.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: arrayBuffer(iv) }, key, arrayBuffer(ciphertext)));
      } catch {
        return null;
      }
    },
  };
}

/** Lazy boundary for synchronous route composition. It never permits plaintext fallback. */
export function createDeferredWorkerPushTokenProtector(secret: string): PushTokenProtector {
  return {
    async encrypt(token) {
      const protector = await createWorkerPushTokenProtector(secret);
      if (!protector) throw new Error("Push token encryption is unavailable.");
      return protector.encrypt(token);
    },
    async decrypt(value) {
      const protector = await createWorkerPushTokenProtector(secret);
      return protector ? protector.decrypt(value) : null;
    },
  };
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function decodeBase64(value: string | undefined): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null;
  return fromBase64Url(value.replace(/\+/g, "-").replace(/\//g, "_"));
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function toBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
