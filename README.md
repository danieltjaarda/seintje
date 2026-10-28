# Seintje

Webhooks en API-berichten als pushmelding op je iPhone, met een overzicht in de app.

- `server/` — Vercel-functies (Fixclan BV, project `seintje`), opslag in Upstash. `npm start` (poort 4700, sleutels "test"), `npm test`.
- `ios/` — SwiftUI-app (`nl.deskna.seintje`, team N2U5A8NF76). `xcodegen generate`, dan bouwen. `Seintje/Resources/Secrets.plist` (niet in git) bevat ServerURL, AppSleutel, HookSleutel.

## Versturen

    curl -X POST https://seintje-lyart.vercel.app/in/<HOOK_SLEUTEL>?bron=Shop \
      -H "Content-Type: application/json" -d '{"titel":"Nieuwe bestelling","tekst":"€ 89,00","url":"https://…"}'

Ook: platte tekst, formulieren, `GET ?titel=…&tekst=…`, `prioriteit=hoog`, of de sleutel als `Authorization: Bearer`.
GitHub, Stripe en Shopify worden aan hun headers herkend.

## Env (Vercel)

HOOK_SLEUTEL, APP_SLEUTEL (ook in kluis onder `seintje`), KV_REST_API_URL/TOKEN (Upstash),
APNS_KEY (inhoud .p8), APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC.
