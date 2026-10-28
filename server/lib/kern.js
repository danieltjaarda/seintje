// Kern van Seintje: opslag, sleutels, webhook-ontleding en meldingen.
// Alle geheimen komen uit env-vars: HOOK_SLEUTEL (in de webhook-URL), APP_SLEUTEL (voor de iPhone-app).
const crypto = require("node:crypto");
const { stuurPush } = require("./apns");

const MAX_MELDINGEN = 1000;
const MAX_RUW = 20000;
const opVercel = () => !!(process.env.VERCEL || process.env.VERCEL_ENV);

// ---------- opslag: Upstash Redis, of geheugen voor lokaal ----------
let geheugen;
function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && tok) {
    return {
      soort: "redis",
      async cmd(...args) {
        const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(args.map(String)) });
        const j = await r.json();
        if (j.error) throw new Error("redis: " + j.error);
        return j.result;
      },
    };
  }
  if (opVercel()) throw new Error("Geen Redis ingesteld");
  geheugen ||= new Map();
  const m = geheugen;
  const h = (k) => { if (!m.has(k)) m.set(k, new Map()); return m.get(k); };
  return {
    soort: "geheugen",
    async cmd(c, k, ...a) {
      c = c.toUpperCase();
      if (c === "HSET") { for (let i = 0; i < a.length; i += 2) h(k).set(a[i], a[i + 1]); return 1; }
      if (c === "HGET") return h(k).get(a[0]) ?? null;
      if (c === "HMGET") return a.map((f) => h(k).get(f) ?? null);
      if (c === "HDEL") { let n = 0; for (const f of a) n += h(k).delete(f) ? 1 : 0; return n; }
      if (c === "HGETALL") return [...h(k)].flat();
      if (c === "DEL") { m.delete(k); return 1; }
      if (c === "LPUSH") { const l = m.get(k) || []; l.unshift(...a.slice().reverse()); m.set(k, l); return l.length; }
      if (c === "LTRIM") { const l = m.get(k) || []; m.set(k, l.slice(Number(a[0]), Number(a[1]) < 0 ? l.length + Number(a[1]) + 1 : Number(a[1]) + 1)); return "OK"; }
      if (c === "LRANGE") { const l = m.get(k) || []; return l.slice(Number(a[0]), Number(a[1]) < 0 ? l.length + Number(a[1]) + 1 : Number(a[1]) + 1); }
      if (c === "LREM") { const l = m.get(k) || []; const n = l.length; m.set(k, l.filter((x) => x !== a[1])); return n - m.get(k).length; }
      throw new Error("onbekend commando " + c);
    },
  };
}
const K = { lijst: "sj:lijst", meldingen: "sj:meldingen", apparaten: "sj:apparaten" };

// ---------- sleutels ----------
function gelijk(a, b) {
  const x = crypto.createHash("sha256").update(String(a || "")).digest();
  const y = crypto.createHash("sha256").update(String(b || "")).digest();
  return crypto.timingSafeEqual(x, y);
}
function sleutel(naam) {
  const v = process.env[naam];
  if (v) return v;
  return opVercel() ? null : "test"; // lokaal: alles met "test"
}
function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}
const isApp = (req) => !!sleutel("APP_SLEUTEL") && gelijk(bearer(req), sleutel("APP_SLEUTEL"));
const isHook = (s) => !!sleutel("HOOK_SLEUTEL") && gelijk(s, sleutel("HOOK_SLEUTEL"));

// ---------- http-hulpjes ----------
async function leesBody(req) {
  const delen = [];
  let n = 0;
  for await (const d of req) {
    n += d.length;
    if (n > 1_000_000) throw Object.assign(new Error("Te groot (max 1 MB)"), { status: 413 });
    delen.push(d);
  }
  return Buffer.concat(delen).toString("utf8");
}
function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}
function queryVan(req) {
  return new URL(req.url, "http://x").searchParams;
}

// ---------- webhook ontleden ----------
const TITEL_VELDEN = ["titel", "title", "onderwerp", "subject", "kop", "heading", "naam", "name", "event", "type", "topic"];
const TEKST_VELDEN = ["tekst", "bericht", "message", "body", "text", "description", "beschrijving", "content", "msg", "details"];
const URL_VELDEN = ["url", "link", "href", "html_url"];

function pak(obj, velden) {
  if (!obj || typeof obj !== "object") return "";
  for (const v of velden) {
    const w = obj[v];
    if (typeof w === "string" && w.trim()) return w.trim();
    if (typeof w === "number") return String(w);
  }
  return "";
}
function kort(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
// "veld: waarde · veld: waarde" van de eenvoudige velden bovenin
function samenvatting(obj) {
  if (!obj || typeof obj !== "object") return "";
  return Object.entries(obj)
    .filter(([, w]) => ["string", "number", "boolean"].includes(typeof w) && String(w).length < 120)
    .slice(0, 6)
    .map(([k, w]) => `${k}: ${w}`)
    .join(" · ");
}
function bronUitHeaders(h) {
  if (h["x-github-event"]) return "GitHub";
  if (h["stripe-signature"]) return "Stripe";
  if (h["x-shopify-topic"]) return "Shopify";
  if (h["x-vercel-signature"]) return "Vercel";
  if (h["x-gitlab-event"]) return "GitLab";
  if (h["x-mollie-signature"]) return "Mollie";
  return "";
}
function bijzonder(h, data) {
  if (h["x-github-event"]) {
    const repo = data?.repository?.full_name || "";
    const actie = data?.action ? " " + data.action : "";
    return {
      titel: `${h["x-github-event"]}${actie}${repo ? " · " + repo : ""}`,
      tekst: data?.head_commit?.message || data?.pull_request?.title || data?.issue?.title || data?.release?.name || "",
      url: data?.pull_request?.html_url || data?.issue?.html_url || data?.compare || data?.repository?.html_url || "",
    };
  }
  if (h["stripe-signature"] && data?.type) {
    const o = data?.data?.object || {};
    const bedrag = typeof o.amount === "number" ? `${(o.amount / 100).toFixed(2)} ${String(o.currency || "").toUpperCase()}` : "";
    return { titel: data.type, tekst: [bedrag, o.customer_email || o.receipt_email || o.description].filter(Boolean).join(" · ") };
  }
  if (h["x-shopify-topic"]) {
    return {
      titel: h["x-shopify-topic"],
      tekst: [data?.name, data?.total_price && `${data.total_price} ${data.currency || ""}`.trim(), data?.email].filter(Boolean).join(" · "),
    };
  }
  return null;
}

// Zet een binnenkomend verzoek om in een melding. Werkt met JSON, formulieren, platte tekst en ?query-velden.
function ontleed({ ruw, contentType = "", headers = {}, query = new URLSearchParams() }) {
  let data = null;
  const ct = contentType.toLowerCase();
  if (ruw) {
    if (ct.includes("json") || /^\s*[{[]/.test(ruw)) {
      try { data = JSON.parse(ruw); } catch { data = null; }
    } else if (ct.includes("x-www-form-urlencoded")) {
      data = Object.fromEntries(new URLSearchParams(ruw));
      // sommige diensten (Slack-achtig) sturen JSON in een "payload"-veld
      if (typeof data.payload === "string") try { data = JSON.parse(data.payload); } catch {}
    }
  }
  const q = Object.fromEntries(query);
  const obj = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const speciaal = bijzonder(headers, data);

  const titel = q.titel || q.title || pak(obj, TITEL_VELDEN) || speciaal?.titel || "";
  let tekst = q.tekst || q.bericht || q.message || pak(obj, TEKST_VELDEN) || speciaal?.tekst || "";
  if (!tekst && ruw && !data) tekst = ruw; // platte tekst
  if (!tekst && data) tekst = samenvatting(Array.isArray(data) ? data[0] : data);

  const bron = q.bron || q.source || q.app || pak(obj, ["bron", "source", "app"]) || bronUitHeaders(headers) || "Webhook";
  const prioriteit = /^(hoog|high|urgent|1|true)$/i.test(q.prioriteit || q.priority || obj.prioriteit || obj.priority || "") ? "hoog" : "normaal";

  return {
    bron: kort(bron, 40),
    titel: kort(titel || (tekst ? bron : "Nieuwe melding"), 120),
    tekst: kort(tekst, 1000),
    url: q.url || pak(obj, URL_VELDEN) || speciaal?.url || "",
    prioriteit,
    ruw: ruw ? ruw.slice(0, MAX_RUW) : Object.keys(q).length ? JSON.stringify(q) : "",
    soort: ct.split(";")[0] || (ruw ? "text/plain" : "query"),
  };
}

// ---------- meldingen ----------
function nieuwId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}
async function bewaar(velden) {
  const s = store();
  const m = { id: nieuwId(), tijd: Date.now(), gelezen: false, ...velden };
  await s.cmd("HSET", K.meldingen, m.id, JSON.stringify(m));
  await s.cmd("LPUSH", K.lijst, m.id);
  // oude meldingen opruimen
  const weg = await s.cmd("LRANGE", K.lijst, MAX_MELDINGEN, -1);
  if (weg?.length) {
    await s.cmd("LTRIM", K.lijst, 0, MAX_MELDINGEN - 1);
    await s.cmd("HDEL", K.meldingen, ...weg);
  }
  return m;
}
async function lijst(limiet = 500) {
  const s = store();
  const ids = await s.cmd("LRANGE", K.lijst, 0, limiet - 1);
  if (!ids?.length) return [];
  const rijen = await s.cmd("HMGET", K.meldingen, ...ids);
  return rijen.filter(Boolean).map((r) => JSON.parse(r));
}
async function ongelezen() {
  return (await lijst(MAX_MELDINGEN)).filter((m) => !m.gelezen).length;
}
async function markeer(ids, alle) {
  const s = store();
  const items = await lijst(MAX_MELDINGEN);
  const kies = alle ? items : items.filter((m) => ids.includes(m.id));
  const gewijzigd = kies.filter((m) => !m.gelezen);
  if (gewijzigd.length) await s.cmd("HSET", K.meldingen, ...gewijzigd.flatMap((m) => [m.id, JSON.stringify({ ...m, gelezen: true })]));
  return gewijzigd.length;
}
async function verwijder(ids, alle) {
  const s = store();
  if (alle) {
    await s.cmd("DEL", K.lijst);
    await s.cmd("DEL", K.meldingen);
    return;
  }
  for (const id of ids) {
    await s.cmd("LREM", K.lijst, 0, id);
    await s.cmd("HDEL", K.meldingen, id);
  }
}

// ---------- apparaten ----------
async function registreer({ token, omgeving, naam }) {
  if (!/^[0-9a-f]{32,200}$/i.test(String(token || ""))) throw Object.assign(new Error("Ongeldig apparaattoken"), { status: 400 });
  const a = { token, omgeving: omgeving === "sandbox" ? "sandbox" : "productie", naam: kort(naam || "iPhone", 60), sinds: Date.now() };
  await store().cmd("HSET", K.apparaten, token, JSON.stringify(a));
  return a;
}
async function apparaten() {
  const plat = await store().cmd("HGETALL", K.apparaten);
  const uit = [];
  for (let i = 0; i < (plat?.length || 0); i += 2) uit.push(JSON.parse(plat[i + 1]));
  return uit;
}

// Melding opslaan en naar alle iPhones pushen.
async function meld(velden) {
  const m = await bewaar(velden);
  const lijstApparaten = await apparaten();
  let push = { verstuurd: 0, mislukt: 0 };
  if (lijstApparaten.length) {
    const badge = await ongelezen();
    const resultaten = await Promise.all(lijstApparaten.map((a) => stuurPush(a, m, badge).catch((e) => ({ ok: false, reden: e.message }))));
    for (let i = 0; i < resultaten.length; i++) {
      const r = resultaten[i];
      if (r.ok) push.verstuurd++;
      else {
        push.mislukt++;
        push.reden = r.reden;
        if (r.weg) await store().cmd("HDEL", K.apparaten, lijstApparaten[i].token);
      }
    }
  }
  return { melding: m, push };
}

module.exports = { store, isApp, isHook, bearer, leesBody, json, queryVan, ontleed, meld, lijst, markeer, verwijder, registreer, apparaten, ongelezen };
