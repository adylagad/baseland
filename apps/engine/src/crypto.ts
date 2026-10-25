import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for Coinbase secrets at rest. Format: "v1:" + base64(iv | tag | ciphertext).
// GCM authenticates, so a tampered ciphertext fails to decrypt rather than
// decrypting to garbage.

const VERSION = "v1:";

export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return VERSION + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptSecret(sealed: string, keyBase64: string): string {
  if (!sealed.startsWith(VERSION)) throw new Error("unknown secret format");
  const raw = Buffer.from(sealed.slice(VERSION.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
