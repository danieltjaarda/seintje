// Lokale server zonder Redis/APNs: sleutels zijn "test". node dev.mjs → http://localhost:4700
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const routes = { in: require("./api/in.js"), meldingen: require("./api/meldingen.js"), apparaat: require("./api/apparaat.js"), test: require("./api/test.js") };
const poort = Number(process.env.PORT) || 4700;

export const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let m = u.pathname.match(/^\/in\/([^/]+)$/);
  if (m) { u.pathname = "/api/in"; u.searchParams.set("s", m[1]); req.url = u.pathname + u.search; return routes.in(req, res); }
  m = u.pathname.match(/^\/api\/(\w+)$/);
  if (m && routes[m[1]]) return routes[m[1]](req, res);
  res.statusCode = 404; res.end("niet gevonden");
});
if (import.meta.url === `file://${process.argv[1]}`) server.listen(poort, () => console.log(`Seintje lokaal op http://localhost:${poort}  (sleutels: test)`));
