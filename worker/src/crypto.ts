/**
 * AES-256-GCM encryption/decryption for OAuth token storage.
 *
 * Crypto choices:
 * - **AES-256-GCM**: Authenticated encryption — provides both confidentiality and
 *   integrity. The 256-bit key length is the strongest available in Web Crypto.
 * - **PBKDF2 with SHA-256**: Derives a fixed-length cryptographic key from an
 *   arbitrary secret string. 100,000 iterations to resist brute-force.
 * - **Random 12-byte IV**: GCM requires a unique IV per encryption; 96 bits is the
 *   recommended size for GCM (avoids internal hashing of the IV).
 * - **Fixed salt derived from secret**: Normally a random salt is stored alongside
 *   the ciphertext. Here each deployment has a unique secret, so deriving the salt
 *   from the secret via SHA-256 is safe and avoids extra storage.
 *
 * Output format (base64-encoded): [ 12-byte IV | ciphertext | 16-byte GCM auth tag ]
 * (Web Crypto returns ciphertext+tag concatenated from AES-GCM encrypt.)
 *
 * Uses the Web Crypto API exclusively — no Node.js modules — so it runs in
 * Cloudflare Workers, Deno, and browsers.
 */

const PBKDF2_ITERATIONS = 100_000;
const IV_BYTES = 12;
const KEY_USAGE = ['encrypt', 'decrypt'] as const;

/** Module-level cache: hex(SHA-256(secret)) → derived CryptoKey */
const keyCache = new Map<string, CryptoKey>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Encode a string to UTF-8 bytes. */
function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Decode UTF-8 bytes to a string. */
function decode(buf: ArrayBuffer): string {
  return new TextDecoder().decode(buf);
}

/** Convert an ArrayBuffer to a base64 string. */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Convert a base64 string to a Uint8Array. */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Hash a value with SHA-256 and return the raw ArrayBuffer. */
async function sha256(data: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', data);
}

/** Hex-encode an ArrayBuffer (used as a cache key). */
function hexEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Derive an AES-256-GCM key from a secret string using PBKDF2.
 *
 * The salt is SHA-256(secret) — acceptable because each deployment uses a
 * unique, high-entropy secret so salt collisions are not a concern.
 *
 * Results are cached so repeated calls with the same secret skip PBKDF2.
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  // Check cache first (keyed by hex hash of the secret).
  const secretBytes = encode(secret);
  const secretHash = hexEncode(await sha256(secretBytes));

  const cached = keyCache.get(secretHash);
  if (cached) return cached;

  // Import the raw secret as a PBKDF2 key.
  const baseKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  // Salt = SHA-256(secret). We already computed this above.
  const salt = await sha256(secretBytes);

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    [...KEY_USAGE],
  );

  keyCache.set(secretHash, derivedKey);
  return derivedKey;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * @param plaintext - The string to encrypt (e.g. a JSON-serialised token).
 * @param secret    - The deployment secret used to derive the encryption key.
 * @returns A base64 string containing `IV || ciphertext || auth-tag`.
 */
export async function encrypt(
  plaintext: string,
  secret: string,
): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  // Web Crypto AES-GCM encrypt returns ciphertext + 16-byte auth tag.
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encode(plaintext),
  );

  // Prepend the IV so we can extract it during decryption.
  const combined = new Uint8Array(IV_BYTES + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), IV_BYTES);

  return toBase64(combined.buffer);
}

/**
 * Decrypt a base64 ciphertext string produced by {@link encrypt}.
 *
 * @param ciphertext - The base64 string from `encrypt()`.
 * @param secret     - The same deployment secret used during encryption.
 * @returns The original plaintext string.
 * @throws If the ciphertext is invalid, tampered with, or the wrong secret is used.
 */
export async function decrypt(
  ciphertext: string,
  secret: string,
): Promise<string> {
  const key = await deriveKey(secret);
  const combined = fromBase64(ciphertext);

  if (combined.length < IV_BYTES + 1) {
    throw new Error('Invalid ciphertext: too short');
  }

  const iv = combined.slice(0, IV_BYTES);
  const data = combined.slice(IV_BYTES);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );

  return decode(decrypted);
}
