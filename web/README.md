# KisanQ — farmer PWA

The Sunrise redesign, built as a Vite + React + TypeScript PWA, Punjabi-first with an
equal three-way language toggle (ਪੰਜਾਬੀ / हिन्दी / English).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

The API is proxied to the Fastify server on `:3000` (see `vite.config.ts`). Until the
farmer endpoints land (backend L1–L4) the app runs against `src/api/mock.ts`, a
localStorage-backed data layer whose shapes match `src/api/types.ts` — which match the
server schema. Swapping to the real API is a change in `src/api/index.ts`, not a screen
rewrite.

## Screens (all farmer-side)

| Route | Sunrise | What it shows |
| --- | --- | --- |
| `/login` | 01 | Mobile → 4-digit OTP with on-screen numeric keypad |
| `/home` | 02 | Next visit + gate OTP, entitlement left, payment, live-queue strip |
| `/queue` | 03 | The tractor lane, live; "Ring my phone" |
| `/book` | 04 | Three-tap booking against **real** slot capacity + entitlement cap |
| `/rates` | 05 | Today's MSP, 7-day trend, nearby mandis, decision advice |
| `/alerts` | 06 | Every outbound SMS/IVR, unread dark — "nothing is lost" |
| `/voice` | 07 | Voice assist: turn / money / rate, spoken back per language |
| `/records` | — | Procurement records, payment failure reasons, published fairness rules |

## SIH features wired in

- **Entitlement cap** — booking quantity is limited by the land record (`holding.entitlementQtl − usedQtl`).
- **Capacity-bound slots** — full windows are disabled; small-holder-reserved windows are labelled.
- **Gate OTP** — shown on Home and in the booking confirmation, never the queue position.
- **Payment black box → surfaced** — held payments show the exact fix in the farmer's language.
- **Published fairness rules** — shown on Records; the real build reads them from `GET /api/v1/public/rules`.
- **Feature-phone parity** — the alerts log records SMS and missed-call IVR messages verbatim.

## Structure

```
src/
  api/         client (index) · mock data layer · shared types
  i18n/        strings (pa/hi/en) + provider
  screens/     the eight farmer screens
  ui.tsx       phone frame, status bar, tab bar, toast, language chips
  theme.css    Sunrise design tokens
  app.css      shell + component styles
```
