// パスワードハッシュ化（PBKDF2）とセッショントークン（HMAC署名）まわりのヘルパー。
// Cloudflare WorkersのランタイムにあるWeb Crypto API（crypto.subtle）のみを使い、
// Node専用のAPIには依存しない。

const PBKDF2_ITERATIONS = 100000;

function bufferToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBuffer(b64) {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return {
    salt: bufferToBase64(salt),
    hash: bufferToBase64(new Uint8Array(bits)),
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function verifyPassword(password, record) {
  const salt = base64ToBuffer(record.salt);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: record.iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return timingSafeEqual(bufferToBase64(new Uint8Array(bits)), record.hash);
}

async function hmacSign(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bufferToBase64(new Uint8Array(sig));
}

export async function signSession(secret, expSeconds) {
  const payload = JSON.stringify({ exp: Date.now() + expSeconds * 1000 });
  const payloadB64 = bufferToBase64(new TextEncoder().encode(payload));
  const sig = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySession(secret, token) {
  if (!token) return false;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return false;
  const expectedSig = await hmacSign(secret, payloadB64);
  if (!timingSafeEqual(sig, expectedSig)) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64ToBuffer(payloadB64)));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
