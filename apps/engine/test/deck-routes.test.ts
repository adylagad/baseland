import { describe, expect, it } from "vitest";
import { Cartridge, examples } from "@baseland/play-schema";
import { memoryDeckStore } from "../src/brain/deck-store.js";
import { DraftError } from "../src/brain/drafter.js";
import { memoryCredentialStore } from "../src/credentials/store.js";
import { buildServer } from "../src/server.js";
import { harness } from "./harness.js";
import { fakeCoinbase, fakeMarket, SECRET, verifyToken } from "./helpers.js";

const alice = { authorization: "Bearer token-alice" };

async function setup() {
  const h = harness();
  await h.price("ETH-USDC", 2000);
  await h.price("BTC-USDC", 100);
  const deck = memoryDeckStore();
  let deckCalls = 0;
  const drafter = {
    async fromSentence(text: string) {
      if (text.includes("NVDA")) throw new DraftError("Stock Plays need live stock prices.");
      return Cartridge.parse(examples.ethNow);
    },
    async deck() {
      deckCalls++;
      return [
        { cartridge: Cartridge.parse(examples.ethBreakout), rationale: "ETH is up 2% on volume." },
        { cartridge: Cartridge.parse(examples.btcDip), rationale: "BTC dips have been bought." },
      ];
    },
  };
  const app = buildServer({
    verifyToken,
    run: fakeCoinbase({ portfolios: [], accessible: [] }),
    credentials: memoryCredentialStore(),
    market: fakeMarket,
    credentialsSecret: SECRET,
    runtime: h.runtime,
    words: { drafter, deck, holdingsOf: async () => "Ghost cash $100.00" },
  });
  return { app, h, deck, deckCalls: () => deckCalls };
}

describe("Deck", () => {
  it("generates once, then serves the fresh cards; refresh regenerates", async () => {
    const { app, deckCalls } = await setup();
    const first = await app.inject({ method: "GET", url: "/v1/deck", headers: alice });
    expect(first.json().cards.map((c: { title: string }) => c.title)).toEqual(["ETH breakout", "Buy the BTC dip"]);
    await app.inject({ method: "GET", url: "/v1/deck", headers: alice });
    expect(deckCalls()).toBe(1);
    await app.inject({ method: "GET", url: "/v1/deck?refresh=1", headers: alice });
    expect(deckCalls()).toBe(2);
  });

  it("arming a card creates a Ghost Play and retires the card; arming twice is refused", async () => {
    const { app } = await setup();
    const card = (await app.inject({ method: "GET", url: "/v1/deck", headers: alice })).json().cards[1];
    const armed = await app.inject({ method: "POST", url: `/v1/deck/${card.id}/arm`, headers: alice, payload: {} });
    expect(armed.statusCode).toBe(201);
    expect(armed.json()).toMatchObject({ mode: "ghost", title: "Buy the BTC dip", state: "watching" });
    expect((await app.inject({ method: "POST", url: `/v1/deck/${card.id}/arm`, headers: alice, payload: {} })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/v1/deck/${card.id}/arm`, headers: { authorization: "Bearer token-bob" }, payload: {} })).statusCode).toBe(404);
  });

  it("arms an edited cartridge sent back with the card", async () => {
    const { app } = await setup();
    const card = (await app.inject({ method: "GET", url: "/v1/deck", headers: alice })).json().cards[0];
    const edited = { ...card.spec, action: { ...card.spec.action, quoteUsd: 2 } };
    const play = (await app.inject({ method: "POST", url: `/v1/deck/${card.id}/arm`, headers: alice, payload: { cartridge: edited } })).json();
    expect(play.spec.action.quoteUsd).toBe(2);
  });
});

describe("draft and preview", () => {
  it("drafts a cartridge from words, and explains what it can't do", async () => {
    const { app } = await setup();
    const ok = await app.inject({ method: "POST", url: "/v1/plays/draft", headers: alice, payload: { text: "buy two bucks of eth now" } });
    expect(ok.json().cartridge.title).toBe("Buy ETH now");
    const no = await app.inject({ method: "POST", url: "/v1/plays/draft", headers: alice, payload: { text: "buy NVDA on earnings" } });
    expect(no.statusCode).toBe(422);
    expect(no.json().error).toMatch(/Stock Plays/);
  });

  it("preview regenerates the sentence after a chip edit, and validates", async () => {
    const { app } = await setup();
    const c = { ...structuredClone(examples.ethBreakout), action: { side: "BUY", product: "ETH-USDC", quoteUsd: 4 } };
    const res = (await app.inject({ method: "POST", url: "/v1/cartridges/preview", headers: alice, payload: { cartridge: c } })).json();
    expect(res.valid).toBe(true);
    expect(res.cartridge.sentence.find((p: { id?: string }) => p.id === "amount").label).toBe("$4");
    const bad = (await app.inject({ method: "POST", url: "/v1/cartridges/preview", headers: alice, payload: { cartridge: { ...c, action: { ...c.action, quoteUsd: 50 } } } })).json();
    expect(bad).toMatchObject({ valid: false });
    expect(bad.issues[0]).toMatch(/Leash/);
  });
});
