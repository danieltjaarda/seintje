// Voor de app. GET: overzicht. POST {actie:"gelezen"|"verwijder", ids:[…] | alle:true}
const k = require("../lib/kern");

module.exports = async (req, res) => {
  try {
    if (!k.isApp(req)) return k.json(res, 401, { fout: "Geen toegang" });
    if (req.method === "GET") {
      const meldingen = await k.lijst(Number(k.queryVan(req).get("limiet")) || 500);
      return k.json(res, 200, { meldingen, ongelezen: meldingen.filter((m) => !m.gelezen).length });
    }
    if (req.method !== "POST") return k.json(res, 405, { fout: "Methode niet toegestaan" });
    const { actie, ids = [], alle = false } = JSON.parse((await k.leesBody(req)) || "{}");
    if (actie === "gelezen") return k.json(res, 200, { ok: true, aantal: await k.markeer(ids, alle) });
    if (actie === "verwijder") { await k.verwijder(ids, alle); return k.json(res, 200, { ok: true }); }
    k.json(res, 400, { fout: "Onbekende actie" });
  } catch (e) {
    k.json(res, e.status || 500, { fout: e.message });
  }
};
