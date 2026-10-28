// De app meldt hier zijn push-token aan. POST {token, omgeving:"sandbox"|"productie", naam}
const k = require("../lib/kern");
const { apnsConfig } = require("../lib/apns");

module.exports = async (req, res) => {
  try {
    if (!k.isApp(req)) return k.json(res, 401, { fout: "Geen toegang" });
    if (req.method === "GET") return k.json(res, 200, { apparaten: (await k.apparaten()).map(({ token, ...a }) => ({ ...a, token: token.slice(0, 8) + "…" })), apns: !!apnsConfig() });
    if (req.method !== "POST") return k.json(res, 405, { fout: "Methode niet toegestaan" });
    const a = await k.registreer(JSON.parse((await k.leesBody(req)) || "{}"));
    k.json(res, 200, { ok: true, omgeving: a.omgeving, apns: !!apnsConfig() });
  } catch (e) {
    k.json(res, e.status || 500, { fout: e.message });
  }
};
