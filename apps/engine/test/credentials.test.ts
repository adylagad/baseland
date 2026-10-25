import { describe, expect, it } from "vitest";
import { decryptSecret } from "../src/crypto.js";
import { fakeCoinbase, SECRET, testServer } from "./helpers.js";

const DEFAULT = { uuid: "d-1", name: "Default", type: "DEFAULT" };
const BASELAND = { uuid: "b-1", name: "baseland", type: "CONSUMER" };
const OTHER = { uuid: "o-1", name: "other", type: "CONSUMER" };
const KEY_FILE = { id: "key-id-1", privateKey: "PRIVATE-KEY-MATERIAL" };
const auth = { authorization: "Bearer token-user-1" };

describe("POST /v1/credentials", () => {
  it("requires a user", async () => {
    const { app } = testServer(fakeCoinbase({ portfolios: [BASELAND], accessible: ["b-1"] }));
    const res = await app.inject({ method: "POST", url: "/v1/credentials", payload: KEY_FILE });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a key scoped to one dedicated portfolio and stores only ciphertext", async () => {
    const { app, store } = testServer(
      fakeCoinbase({ portfolios: [DEFAULT, BASELAND], accessible: ["b-1"] }),
    );
    const res = await app.inject({ method: "POST", url: "/v1/credentials", headers: auth, payload: KEY_FILE });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ connected: true, portfolio: { uuid: "b-1", name: "baseland" } });
    expect(res.body).not.toContain("PRIVATE-KEY-MATERIAL");

    const row = store.rows.get("user-1")!;
    expect(row.keyId).toBe("key-id-1");
    expect(JSON.stringify(row)).not.toContain("PRIVATE-KEY-MATERIAL");
    expect(decryptSecret(row.secretCiphertext, SECRET)).toBe("PRIVATE-KEY-MATERIAL");
  });

  it("refuses a key that can reach the Default portfolio", async () => {
    const { app, store } = testServer(fakeCoinbase({ portfolios: [DEFAULT, BASELAND], accessible: ["d-1"] }));
    const res = await app.inject({ method: "POST", url: "/v1/credentials", headers: auth, payload: KEY_FILE });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Default portfolio/);
    expect(store.rows.size).toBe(0);
  });

  it("refuses a key that reaches more than one portfolio", async () => {
    const { app } = testServer(
      fakeCoinbase({ portfolios: [DEFAULT, BASELAND, OTHER], accessible: ["b-1", "o-1"] }),
    );
    const res = await app.inject({ method: "POST", url: "/v1/credentials", headers: auth, payload: KEY_FILE });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/more than one/);
  });

  it("reports a rejected key clearly", async () => {
    const { app } = testServer(fakeCoinbase({ portfolios: [], accessible: [], rejectKey: true }));
    const res = await app.inject({ method: "POST", url: "/v1/credentials", headers: auth, payload: KEY_FILE });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/401/);
  });

  it("rejects malformed bodies", async () => {
    const { app } = testServer(fakeCoinbase({ portfolios: [BASELAND], accessible: ["b-1"] }));
    const res = await app.inject({ method: "POST", url: "/v1/credentials", headers: auth, payload: { id: "x" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET and DELETE /v1/credentials", () => {
  it("reports connection status without the secret, and disconnects", async () => {
    const { app } = testServer(fakeCoinbase({ portfolios: [DEFAULT, BASELAND], accessible: ["b-1"] }));
    expect((await app.inject({ method: "GET", url: "/v1/credentials", headers: auth })).json()).toEqual({
      connected: false,
    });
    await app.inject({ method: "POST", url: "/v1/credentials", headers: auth, payload: KEY_FILE });

    const status = await app.inject({ method: "GET", url: "/v1/credentials", headers: auth });
    expect(status.json()).toMatchObject({ connected: true, portfolio: { name: "baseland" } });
    expect(status.body).not.toContain("PRIVATE");
    expect(status.body).not.toContain("v1:");

    await app.inject({ method: "DELETE", url: "/v1/credentials", headers: auth });
    expect((await app.inject({ method: "GET", url: "/v1/credentials", headers: auth })).json()).toEqual({
      connected: false,
    });
  });
});
