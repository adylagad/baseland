import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/crypto.js";

const key = randomBytes(32).toString("base64");

describe("secret encryption", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = encryptSecret("my-private-key", key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("my-private-key");
    expect(decryptSecret(sealed, key)).toBe("my-private-key");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
  });

  it("fails on tampering or the wrong key", () => {
    const sealed = encryptSecret("my-private-key", key);
    const raw = Buffer.from(sealed.slice(3), "base64");
    raw[raw.length - 1]! ^= 1;
    expect(() => decryptSecret("v1:" + raw.toString("base64"), key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
});
