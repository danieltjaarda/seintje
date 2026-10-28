// Webhook-ingang: POST of GET naar /in/<HOOK_SLEUTEL>  (ook ?bron=, ?titel=, ?tekst=, ?url=, ?prioriteit=hoog)
const k = require("../lib/kern");

module.exports = async (req, res) => {
  try {
    const q = k.queryVan(req);
    const s = q.get("s") || k.bearer(req);
    q.delete("s");
    if (!k.isHook(s)) return k.json(res, 401, { fout: "Onbekende sleutel" });
    if (!["GET", "POST", "PUT"].includes(req.method)) return k.json(res, 405, { fout: "Gebruik POST of GET" });
    const ruw = req.method === "GET" ? "" : await k.leesBody(req);
    const velden = k.ontleed({ ruw, contentType: req.headers["content-type"] || "", headers: req.headers, query: q });
    const { melding, push } = await k.meld(velden);
    k.json(res, 200, { ok: true, id: melding.id, push });
  } catch (e) {
    k.json(res, e.status || 500, { fout: e.message });
  }
};
