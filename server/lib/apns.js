// Push via Apple Push Notification service (token-based, .p8-sleutel).
// Env: APNS_KEY (inhoud van AuthKey_XXXX.p8), APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC (bundle-ID van de app).
const crypto = require("node:crypto");
const http2 = require("node:http2");

let jwt = { token: "", tijd: 0 };

function apnsConfig() {
  const key = (process.env.APNS_KEY || "").replace(/\\n/g, "\n");
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const topic = process.env.APNS_TOPIC || "nl.deskna.seintje";
  return key && keyId && teamId ? { key, keyId, teamId, topic } : null;
}

// Apple wil een nieuw token hooguit elke 20 min en accepteert ze tot 60 min oud
function maakJwt(c) {
  const nu = Math.floor(Date.now() / 1000);
  if (jwt.token && nu - jwt.tijd < 45 * 60) return jwt.token;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const invoer = b64({ alg: "ES256", kid: c.keyId }) + "." + b64({ iss: c.teamId, iat: nu });
  const sig = crypto.sign("sha256", Buffer.from(invoer), { key: c.key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  jwt = { token: invoer + "." + sig, tijd: nu };
  return jwt.token;
}

function payload(m, badge) {
  return {
    aps: {
      alert: { title: m.titel, subtitle: m.bron !== m.titel ? m.bron : undefined, body: m.tekst || undefined },
      sound: "default",
      badge,
      "thread-id": m.bron,
      "mutable-content": 1,
    },
    id: m.id,
    url: m.url || undefined,
  };
}

// → { ok } of { ok:false, reden, weg } (weg = token is ongeldig, apparaat vergeten)
function stuurPush(apparaat, melding, badge) {
  const c = apnsConfig();
  if (!c) return Promise.resolve({ ok: false, reden: "APNs niet ingesteld" });
  const host = apparaat.omgeving === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  return new Promise((klaar) => {
    const client = http2.connect(host);
    client.on("error", (e) => klaar({ ok: false, reden: e.message }));
    const req = client.request({
      ":method": "POST",
      ":path": "/3/device/" + apparaat.token,
      authorization: "bearer " + maakJwt(c),
      "apns-topic": c.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": melding.id.slice(0, 64),
    });
    let status = 0, body = "";
    req.on("response", (h) => (status = h[":status"]));
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      client.close();
      if (status === 200) return klaar({ ok: true });
      let reden = body;
      try { reden = JSON.parse(body).reason; } catch {}
      klaar({ ok: false, reden: `${status} ${reden}`, weg: status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(reden) });
    });
    req.setTimeout(10000, () => { req.close(); client.close(); klaar({ ok: false, reden: "timeout" }); });
    req.end(JSON.stringify(payload(melding, badge)));
  });
}

module.exports = { stuurPush, apnsConfig, payload };
