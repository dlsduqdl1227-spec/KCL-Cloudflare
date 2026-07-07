function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  return bytesToHex(await crypto.subtle.digest("SHA-256", data));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToHex(sig);
}

export function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export async function otpHash(otp: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${otp}`);
}

export async function makeSolapiSignature(secret: string, date: string, salt: string): Promise<string> {
  return hmacSha256Hex(secret, date + salt);
}
