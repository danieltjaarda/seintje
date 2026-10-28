// Testmelding vanuit de app
const k = require("../lib/kern");

module.exports = async (req, res) => {
  try {
    if (!k.isApp(req)) return k.json(res, 401, { fout: "Geen toegang" });
    if (req.method !== "POST") return k.json(res, 405, { fout: "Gebruik POST" });
    const { push } = await k.meld({ bron: "Seintje", titel: "Testmelding", tekst: "Het werkt! Webhooks komen nu op je iPhone binnen.", url: "", prioriteit: "normaal", ruw: "", soort: "test" });
    k.json(res, 200, { ok: true, push });
  } catch (e) {
    k.json(res, e.status || 500, { fout: e.message });
  }
};
