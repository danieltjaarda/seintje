// node tests/api.test.mjs — draait de lokale server en test de routes (sleutels "test", geheugenopslag)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { server } from "../dev.mjs";
const require = createRequire(import.meta.url);
const { ontleed } = require("../lib/kern.js");
const { payload } = require("../lib/apns.js");

await new Promise((r) => server.listen(0, r));
const basis = `http://localhost:${server.address().port}`;
const app = { Authorization: "Bearer test" };
let ok = 0;
async function test(naam, fn) { await fn(); ok++; console.log("✓", naam); }
const get = (p, h = {}) => fetch(basis + p, { headers: h }).then(async (r) => ({ status: r.status, data: await r.json() }));
const post = (p, body, h = {}) => fetch(basis + p, { method: "POST", headers: h, body }).then(async (r) => ({ status: r.status, data: await r.json() }));

await test("verkeerde hook-sleutel → 401", async () => assert.equal((await post("/in/fout", "{}")).status, 401));
await test("app zonder sleutel → 401", async () => assert.equal((await get("/api/meldingen")).status, 401));
await test("JSON-webhook", async () => {
  const r = await post("/in/test?bron=Shop", JSON.stringify({ title: "Nieuwe bestelling", message: "€ 89,00 van Piet", url: "https://x.nl/1" }), { "Content-Type": "application/json" });
  assert.equal(r.status, 200);
  assert.equal(r.data.push.verstuurd, 0);
});
await test("platte tekst + GET met query", async () => {
  assert.equal((await post("/in/test", "Back-up klaar", { "Content-Type": "text/plain" })).status, 200);
  assert.equal((await get("/in/test?titel=Hoi&tekst=via%20GET&prioriteit=hoog")).status, 200);
});
await test("Bearer-sleutel op /in werkt ook", async () => {
  const r = await fetch(basis + "/api/in", { method: "POST", headers: { Authorization: "Bearer test" }, body: "x" });
  assert.equal(r.status, 200);
});
let lijst;
await test("overzicht, nieuwste eerst", async () => {
  const r = await get("/api/meldingen", app);
  lijst = r.data.meldingen;
  assert.equal(lijst.length, 4);
  assert.equal(r.data.ongelezen, 4);
  assert.equal(lijst[1].titel, "Hoi");
  assert.equal(lijst[1].prioriteit, "hoog");
  assert.equal(lijst[3].bron, "Shop");
  assert.equal(lijst[3].url, "https://x.nl/1");
  assert.equal(lijst[2].tekst, "Back-up klaar");
});
await test("gelezen en verwijderen", async () => {
  await post("/api/meldingen", JSON.stringify({ actie: "gelezen", ids: [lijst[0].id] }), app);
  assert.equal((await get("/api/meldingen", app)).data.ongelezen, 3);
  await post("/api/meldingen", JSON.stringify({ actie: "verwijder", ids: [lijst[0].id] }), app);
  assert.equal((await get("/api/meldingen", app)).data.meldingen.length, 3);
  await post("/api/meldingen", JSON.stringify({ actie: "gelezen", alle: true }), app);
  assert.equal((await get("/api/meldingen", app)).data.ongelezen, 0);
});
await test("apparaat aanmelden", async () => {
  assert.equal((await post("/api/apparaat", JSON.stringify({ token: "zz" }), app)).status, 400);
  const r = await post("/api/apparaat", JSON.stringify({ token: "a".repeat(64), omgeving: "sandbox", naam: "Test" }), app);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.apns, false);
  const t = await post("/api/test", "", app);
  assert.equal(t.data.push.mislukt, 1); // geen APNs-sleutel lokaal
});
await test("ontleden: GitHub, Stripe, formulier, onbekend JSON", async () => {
  const gh = ontleed({ ruw: JSON.stringify({ action: "opened", repository: { full_name: "d/x" }, pull_request: { title: "Fix", html_url: "https://gh/1" } }), contentType: "application/json", headers: { "x-github-event": "pull_request" } });
  assert.deepEqual([gh.bron, gh.titel, gh.tekst, gh.url], ["GitHub", "pull_request opened · d/x", "Fix", "https://gh/1"]);
  const st = ontleed({ ruw: JSON.stringify({ type: "charge.succeeded", data: { object: { amount: 4950, currency: "eur", receipt_email: "a@b.nl" } } }), contentType: "application/json", headers: { "stripe-signature": "x" } });
  assert.equal(st.bron, "Stripe");
  assert.equal(st.titel, "charge.succeeded");
  assert.equal(st.tekst, "49.50 EUR · a@b.nl");
  const fo = ontleed({ ruw: "naam=Jan&bericht=Bel%20me", contentType: "application/x-www-form-urlencoded" });
  assert.deepEqual([fo.titel, fo.tekst], ["Jan", "Bel me"]);
  const on = ontleed({ ruw: JSON.stringify({ orderId: 12, status: "betaald", nested: { a: 1 } }), contentType: "application/json" });
  assert.deepEqual([on.titel, on.tekst], ["Webhook", "orderId: 12 · status: betaald"]);
});
await test("push-payload", async () => {
  const p = payload({ id: "1", titel: "T", bron: "B", tekst: "x" }, 3);
  assert.equal(p.aps.badge, 3);
  assert.equal(p.aps.alert.subtitle, "B");
  assert.equal(p.id, "1");
});
server.close();
console.log(`\n${ok} tests geslaagd`);
