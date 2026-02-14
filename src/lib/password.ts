/**
 * Password hashing with PBKDF2-SHA256 (Web Crypto API — works in Vercel Edge + Node.js)
 * Format: iterations:salt_hex:hash_hex
 */

const ITERATIONS = 100_000;
const HASH_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits

function hexEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    HASH_LENGTH * 8
  );

  return `${ITERATIONS}:${hexEncode(salt)}:${hexEncode(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [iterStr, saltHex, hashHex] = stored.split(':');
    const iterations = parseInt(iterStr);
    const salt = hexDecode(saltHex);
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );

    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
      key,
      HASH_LENGTH * 8
    );

    const expected = hexDecode(hashHex);
    const actual = new Uint8Array(derived);

    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected[i] ^ actual[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}
