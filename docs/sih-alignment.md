# SIH alignment

Source of truth: `KisanQ_SIH_Idea.pptx` (Smart India Hackathon 2025, problem **SIH26032**,
Agriculture / FoodTech & Rural Development, Software).

> Farmers often face long waiting times, lack of information regarding procurement
> schedules, and uncertainty about procurement status.

Every commitment the deck makes is listed below with the place in this codebase that
keeps it. If a row has no file, it is not built yet — and the level it belongs to is
named instead. Nothing in this table is aspirational: a row either points at code or
says which level will add it.

---

## Slide 2 — the four problems, and the four steps

| Deck says | Where it lives | Level |
| --- | --- | --- |
| "Everyone arrives on day one" | `domain/capacity.ts` → `planDay()` spreads a day's capacity across five 2-hour windows | L0 ✅ |
| "No idea when the turn will come" | `domain/fairness.ts` → `estimateWaitMinutes()`, `rollingMeanServiceSec()` | L0 ✅ (served over SSE at L3) |
| "Payment is a black box" | `payments` table with `failureCode` + `failureReason`; `domain/impact.ts` → `failureSurfacedInTime()` | L4 |
| "Centre has no forecast" | `centre_days` capacity vs `bookings` — district forecast read-model | L5 |
| 1 Register · 2 Book slot · 3 Live queue · 4 Get paid | `users`/`holdings` · `bookings` · `tokens`/`service_events` · `lots`/`payments` | L1–L4 |
| "Works on a feature phone, in the farmer's language" | `users.language` (pa/hi/en), `messages.channel` (sms/ivr/push/in_app), `bookings.bookedVia` | L1 ✅ schema, L5 live |

### Innovation claims

| Claim | Implementation | Level |
| --- | --- | --- |
| `capacity = min(weighbridge, gunny bags, godown space)` | `domain/capacity.ts` → `computeCapacity()`, and it reports **which** input is binding | L0 ✅ |
| "Queue sorted by slot window, not arrival time" | `tokens` ordering index on `(centre_id, date, window_start, checked_in_at)` | L0 ✅ schema, L3 logic |
| "ETA from a rolling mean of the last 20 lots" | `rollingMeanServiceSec(durations, window = 20)` | L0 ✅ |
| "Feature-phone first" | `messages`, `pending_decisions` (reply-by-digit), `bookedVia` | L5 |
| "Offline-first operator app" | `tokens.clientUuid` unique + `idempotency_keys` | L6 |
| "OTP + vehicle number at the gate makes a token worthless to resell" | `bookings.gateOtpHash` (scrypt, never plain text) + `bookings.vehicleNo` | L0 ✅ schema, L3 enforcement |

---

## Slide 3 — methodology, six steps

| Step | Deck detail | Code | Level |
| --- | --- | --- | --- |
| 1 Register | Aadhaar + land record → entitlement in quintals | `users.aadhaarRef` (opaque ref), `holdings.entitlementQtl` / `usedQtl` | L1 |
| 2 Book slot | 2-hour window; trolley + qtl quota; 15% reserve | `slots` (2-hour), `capacityTrolleys`+`capacityQtl`, `splitPools()` | L2 |
| 3 Check-in | OTP + vehicle no. at the gate → token | `POST /op/checkin`, `tokens` born here, not at booking | L3 |
| 4 Live queue | position + ETA; "5 away" SMS; display board | `service_events`, SSE, `/public/board/:centreId` | L3 |
| 5 Quality & weigh | moisture vs norm; net qtl; digital receipt | `lots` (moisturePct, normPct, gross/tare/net, receiptNo) | L4 |
| 6 Payment | DBT initiated → credited / failed + reason | `payments` state machine + return-file worker | L4 |

### System components

| Component | Status |
| --- | --- |
| Farmer PWA + SMS / IVR channel | PWA is the Sunrise redesign; channel interface at L1 (stub) → L5 (live) |
| **Slot engine — server-authoritative, sole writer of bookings** | `centre_days` is the lock row; booking takes `SELECT … FOR UPDATE` on it. **L2** |
| Operator console — offline-first, token order centre-local | `tokens` unique on `(centre_id, date, seq)`; `clientUuid` for replay. **L6** |
| Notification service — DLT SMS, delivery receipts | `messages` with `providerId`, `sentAt`, `deliveredAt`, `status`. **L4/L5** |
| DBT reconciliation worker — bank return file → reason | `payments.failureCode` → `failureReason` in the farmer's language. **L4** |
| District dashboard — forecast, pendency | Read-models over `centre_days` + `payments`. **L5** |

### "Rules that keep it fair" — all four, in one file

Every one of these is a constant in `src/domain/fairness.ts`, and all four are served
unauthenticated from `GET /api/v1/public/rules` so the published rule and the enforced
rule cannot drift apart.

| Rule | Constant / function |
| --- | --- |
| Order = (slot window, check-in time); late → back of your own window | `FAIRNESS_RULES.ordering`, tokens order index |
| Rained-out farmers get a 6-hour first refusal on released slots | `firstRefusalHours: 6`, `firstRefusalExpiry()`, **`slot_holds` table** |
| 30% of slots reserved for holdings under 2 ha until 24 h before | `smallHolderPct: 30`, `smallHolderMaxHa: 2`, `poolReleaseHoursBefore: 24`, `splitPools()`, `eligiblePools()` |
| ETA = tokens ahead ÷ active lanes × rolling mean service time | `estimateWaitMinutes()` |

### The three SMS bodies

The deck writes them out in Hindi. They become DLT templates in `packages/i18n`, one per
language, rendered into `messages.body` verbatim before sending:

1. `booking_confirmed` — *पर्ची पक्की — नाभा केंद्र, 14 अप्रैल, 11:00–13:00. गेट OTP 4417.*
2. `queue_five_away` — *आपका नंबर 5 गाड़ी बाद. कृपया लेन 3 पर पहुँचें.*
3. `payment_failed` — *भुगतान रुका — खाते से आधार लिंक नहीं. शाखा में KYC कराएँ.*

Plus `reply 1 to accept a new slot` → `pending_decisions`, and missed-call IVR → `messages.channel = "ivr"`.

---

## Slide 4 — risks, and the mechanism that answers each

This is the slide that most changed the schema. Each risk has a named mechanism, so
each mechanism needs a place to live.

| Risk | Deck's answer | Mechanism in code |
| --- | --- | --- |
| Rain, full godown, bag shortage collapses the day | `centre_event` → automatic reschedule; farmer replies "1"; the 15% reserve absorbs spill-over | `centre_events` table (`rain`, `godown_full`, `bag_shortage`, `weighbridge_down`), `pending_decisions`, reserve pool |
| Farmers without smartphones or literacy | SMS-first reply-by-digit, missed-call IVR, **assisted booking at panchayat / CSC** | `messages`, `pending_decisions`, **`role: "assistant"`**, `bookings.bookedByUserId` + `bookedVia` |
| No network at the centre for hours | Operator app fully offline; token order centre-local; server merges by centre + date | `tokens.clientUuid` unique, `(centre_id, date, seq)` unique, `idempotency_keys` |
| Token resale, proxy farmers, traders posing as growers | OTP on the registered mobile + vehicle number at the gate; **quantity capped by the land record** | `gateOtpHash` (hashed), `vehicleNo`, **`bookableQtl()`** against `holdings.entitlementQtl − usedQtl` |
| Farmers do not trust the algorithm | **Published fairness rules**; **anonymised token ledger** per centre per day; small-holding reservation | **`GET /api/v1/public/rules`** ✅ live now; ledger from `tokens` with no user identity (L3) |
| No-shows drain the slots | Slot returns to the reserve within the grace window; **repeated no-shows lower the priority score** | **`users.priorityScore` / `noShowCount`**, `bookings.noShowAt`, `isNoShow()`, `applyNoShow()`, `applyCompletedVisit()` |

---

## Slide 5 — the impact claims, measured rather than asserted

Four numbers are promised. `src/domain/impact.ts` computes each one from real rows, so
the claim can be checked against the running system instead of taken on faith.

| Claim | Function | Target |
| --- | --- | --- |
| Wait 2–5 days → under 90 min | `medianWaitMinutes()` over `tokens.checkedInAt → servedAt` | < 90 min |
| Peak-to-average arrivals 3.8× → 1.3× | `peakToAverage()` over hourly check-in counts | < 1.3 |
| Payment silent 10+ days → surfaced within 24 h | `failureSurfacedInTime()` over `payments.initiatedAt` → notifying `messages.sentAt` | ≤ 24 h (DBT promise is 48 h) |
| 0 → 100% know their turn before leaving home | `knewTheirTurnPct()` | 100% |

Governance benefit — *"every grievance tied to a lot ID"* — is the **`grievances`** table,
with `lotId` and `bookingId` foreign keys and a public `ref`.

---

## What the deck asks for that we deliberately do not build

Stated plainly here so it can be stated plainly in the pitch.

| Not built | Why | What we do instead |
| --- | --- | --- |
| Aadhaar eKYC | Access-controlled; not granted to a student team | `users.aadhaarRef` is an opaque reference; entitlement logic behind it is fully real |
| State land records (Jamabandi / Bhulekh) | Same | `holdings` seeded from CSV, `entitlementQtl` enforced on every booking |
| Real DBT disbursement | Needs a treasury sponsor | Full state machine + return-file importer, fed a sample CSV |
| DLT template registration | Weeks of paperwork, needs a registered entity | `CHANNEL_DRIVER=stub` writes every message to `messages`; one env var switches to live |

---

## Gaps in the deck itself

Worth fixing before submission — these are blank in the file as it stands:

- **Slide 1**: team name and registration fields are `____________`.
- **Slide 3, "Technologies to be used"**: the seven labels (Farmer / Operator / Backend /
  Slot engine / Integrations / Admin / Hardware) are present with **no values filled in**.
  Fill from the stack doc:
  - **Farmer** — PWA (Vite + React), service worker, SMS + missed-call IVR fallback
  - **Operator** — offline-first web console, IndexedDB outbox, batch sync
  - **Backend** — Node 20, Fastify, TypeScript, PostgreSQL 16, Redis, BullMQ
  - **Slot engine** — transactional Postgres (`SELECT … FOR UPDATE`), pure domain module
  - **Integrations** — DLT SMS (MSG91/Gupshup), IVR (Exotel), Bhashini for Punjabi/Hindi TTS + ASR, data.gov.in Agmarknet for mandi rates
  - **Admin** — district dashboard, forecast and pendency read-models
  - **Hardware** — existing weighbridge and moisture meter, one display screen at the gate; no new hardware required
- **Slide 6** reference URLs are elided with `…` — restore full links before submitting.

---

## L1 build note — what shipped

| Deck requirement | Shipped |
| --- | --- |
| "in the farmer's language" | `users.language` set from the sign-in screen and carried in the JWT, so every later SMS, IVR call and error message reads it without a database hit |
| "works on a feature phone" | Mobile is the identity — no email, no password. `normaliseMobile()` collapses `9876543210`, `09876543210`, `+91 98765 43210` into one farmer, which is what stops one person holding three entitlements |
| Every outbound SMS persisted | `StubChannel` writes the `messages` row **before** logging, and never rolls it back on provider failure |
| The three SMS bodies (slide 3) | Transcribed verbatim into `src/i18n/templates.ts` as DLT-shaped templates in pa/hi/en, with a test asserting the Hindi renders exactly as the deck prints it |
| Token resale / proxy farmers | OTP codes are scrypt-hashed at rest; five wrong tries burns the request |

Refresh tokens rotate, and replaying a rotated one revokes the entire family — the one
place where inconveniencing a real farmer is the right trade, because the alternative is
a stolen session running beside the real one.

---

## L2 build note — what shipped

The level that carries the submission's central claim: *"server-authoritative, sole
writer of bookings"*.

| Deck requirement | Shipped |
| --- | --- |
| `capacity = min(weighbridge, gunny bags, godown)` | Frozen per centre-day at seed time; `computeCapacity()` reports the binding constraint |
| "2-hour window; trolley + qtl quota" | `slots` are 2-hour windows carrying both a trolley and a quintal counter; a booking checks both |
| "15% reserve" + "30% for holdings under 2 ha until 24 h before" | `splitPools()` / `eligiblePools()` — a small holder sees the protected pool, a large holder does not, and both open to all at T-24h |
| "quantity capped by the land record" | `holdings.usedQtl` is incremented inside the booking transaction and released on cancel, so the cap holds across the whole season |
| Slot engine is the **sole writer** | Bookings, reschedules and cancels are the only writers of slot/centre-day counters, and every one runs inside a transaction holding `SELECT … FOR UPDATE` on the centre-day |
| Feature-phone double-tap / offline replay | `Idempotency-Key` required on every mutation; a repeat replays the stored response — a committed booking, or a cached `SLOT_FULL` — never a second attempt |

**The gate:** `tests/booking.concurrency.test.ts` fires 50 concurrent bookings at a
10-seat slot against a real Postgres and asserts exactly 10 succeed, 40 get a typed
`SLOT_FULL`, the denormalised counters reconcile against `count(*)`, and only the ten
winners spent entitlement. This is the exhibit for the pitch.

---

## L3 build note — what shipped

The live floor — where the deck's "no idea when the turn will come" is answered.

| Deck requirement | Shipped |
| --- | --- |
| "Check-in: OTP + vehicle no. at the gate → token" | `POST /op/checkin` verifies the gate OTP (hashed) and records the vehicle; the token is created only here, never at booking |
| "OTP + vehicle number makes a token worthless to resell" | A buyer would need the seller's SMS code *and* to arrive in the right vehicle; the code is checked with `verifySecret`, never stored in the clear |
| "Order = (slot window, check-in time). Late → back of your own window" | `servingOrder()` sorts by `(windowStart, checkedInAt)`; a flow test proves a late 8am farmer still beats an on-time 10am farmer |
| "ETA = tokens ahead ÷ active lanes × rolling mean service time" | `estimateWaitMinutes()` over `rollingMeanServiceSec()` of the last 20 real `service_events` |
| "position + ETA; '5 away' SMS; display board" | `GET /queue/live` + `/queue/stream` (SSE); the 5-away watcher fires on `serve/next`; `/public/board/:id` + `/stream` |
| "Ring my phone" | `POST /queue/notify` registers a threshold; the watcher rings once and stamps `firedAt` so it never rings twice |
| "anonymised token ledger per centre per day" | `GET /public/board/:id/ledger` exposes order and outcomes with **no name, mobile or user id** — asserted by a test |
| Offline operator console (groundwork) | `checkin` is idempotent on `clientUuid`, so an offline replay never creates a second token — the sync path L6 builds on |

**The gate:** an operator's single `serve/next` pushes a fresh snapshot to both the
farmer's SSE stream and the unauthenticated board stream, with no polling — verified
live, and the state transitions asserted in `tests/queue.flow.test.ts`.

**Note on realtime transport:** the live fan-out is an in-process event bus, which is
correct for one API instance (all a demo needs). Multiple instances swap it for Redis
pub/sub behind the same `bus.publish` / `bus.subscribe` interface — no route changes.

---

## L4 build note — what shipped

The money trail — the deck's "payment is a black box" turned into a tracked state
with a reason.

| Deck requirement | Shipped |
| --- | --- |
| "Quality & weigh: moisture vs norm; net qtl; digital receipt" | `POST /op/lots` records moisture against the FAQ norm, computes net = gross − tare, and writes an immutable `lots` row with a receipt number (one per booking, unique index) |
| "Payment: DBT initiated → credited / failed + reason" | `src/domain/payments.ts` state machine; illegal jumps (e.g. `pending → credited`) are refused |
| "DBT reconciliation worker (bank return file → reason)" | `POST /hooks/bank/return-file` settles each payment; `src/i18n/bankReasons.ts` maps bank codes to a fix in pa/hi/en |
| "payment failed + the exact fix" (slide 3 SMS) | The `payment_failed` template fires on a failed row — verified live as *ਭੁਗਤਾਨ ਰੁਕਿਆ — ਖਾਤੇ ਨਾਲ ਆਧਾਰ ਲਿੰਕ ਨਹੀਂ. ਸ਼ਾਖਾ ਵਿੱਚ KYC ਕਰਵਾਓ.* |
| "failure reason surfaced within 24 h" (slide 5) | The reason reaches the farmer's alerts log the moment the return file is applied; `hoursOutstanding()` exposes the 48-hour SLA for the district view |
| "Alerts & SMS log — nothing is lost" | `GET /messages` / `POST /messages/:id/read`; every credited and failed notice is a persisted `messages` row |
| "audit trail of quality readings, receipts and payments" | `src/lib/audit.ts` writes `audit_log` on every lot and every payment transition with actor and before/after |

**The gate:** import a return file containing one failure; within one reconciliation
run the farmer's alerts screen shows the Punjabi line naming the exact fix and the
tracker shows the payment `failed`. Verified live and in `tests/money.flow.test.ts`.

---

## L5 build note — what shipped

Reach — the feature phone, the local language, and the price that decides the trip.

| Deck requirement | Shipped |
| --- | --- |
| "Crop rates: today's MSP, week trend, nearby-mandi comparison" | `GET /rates` — 7-day trend, nearby mandis, and *decision help* ("₹X higher one mandi over — worth it only if the trip costs less"). Live Agmarknet ingest is a named seam behind `DATA_GOV_API_KEY` |
| "Voice assist: when is my turn / where is my money / what is the wheat rate" | `POST /assist/ask` — `src/domain/assist.ts` detects the intent in pa/hi/en and answers from the *same* queue/payment/rate data the screens use |
| "centre_event → automatic reschedule; farmer replies 1; the 15% reserve absorbs the spill-over" | `POST /op/events` frees affected bookings, holds a future slot for 6 hours (first refusal), and sends a reply-by-digit offer |
| "Reply 1 to accept a new slot" | `POST /hooks/sms/inbound` resolves the offer and books the held slot through the same locked path — verified live from a bare mobile number |
| "missed call → IVR reads status aloud" | `POST /hooks/ivr` returns the queue + payment lines in the stored language |
| "Notification service (DLT SMS, delivery receipts)" | `Msg91Channel` behind the same `Channel` interface; `POST /hooks/sms/dlr` stamps `messages.deliveredAt` |
| "6-hour first refusal" made real | `slot_holds` now reduce bookable capacity for everyone but the holder — a test proves another farmer is refused `SLOT_FULL` on a held seat while the rained-out farmer can take it |
| "District dashboard (forecast, pendency)" | `GET /district/:d/overview` (arrivals vs capacity, payment ageing past the 48h promise) and `/forecast` (7-day booked qtl per centre) |

**The gate:** rain closes a day; the farmer, on a feature phone, replies `1` and their
booking moves onto a slot that was held just for them. Verified end to end.

**Still stubbed by choice:** real DLT SMS and IVR need registered templates and a
vendor account (paperwork, not engineering). `CHANNEL_DRIVER=stub` runs and demos the
entire flow; one env var flips it to live.

---

## L6 build note — what shipped

Field-hard — the mandi loses its network and the day continues anyway.

| Deck requirement | Shipped |
| --- | --- |
| "Operator console (offline-first, token order centre-local)" | `GET /op/centre/:id/day/:date` day pack; the console runs from it with no network |
| "syncs on reconnect and the server merges by centre + date" | `POST /op/sync` replays the outbox; each op is deduped by `clientUuid`, merged under the centre-day lock |
| "token order is centre-local" | Tokens keep their real arrival order via the client timestamp (`at` → `checkedInAt`), not the sync time |
| Exactly-once under replay | The L6 gate: replay the same outbox twice → every op `replayed`, no duplicate token — `tests/offline.sync.test.ts` |
| Hardening | CORS allow-list (not `*`), helmet, 1 MB body cap, per-route + per-mobile rate limits, `@fastify/under-pressure` load shedding, `audit_log` on every token/lot/payment/event/reschedule |
| Secrets | `JWT_SECRET` generated by Render; OTPs/gate-OTPs/refresh-tokens hashed at rest; `devCode` never returned in production (verified against the compiled build) |
| Deploy | `render.yaml` blueprint — web + Postgres 16 + Redis; migrations run pre-deploy; `docs/deploy.md` covers go-live |

**The gate:** pull the network mid-day, check three farmers in on the offline console,
reconnect. Every check-in lands exactly once, in order, with no duplicate token number.

---

## Status: all six levels complete

149 tests across pure domain logic, transactional integration, concurrency, live
queue, money trail, reach, and offline sync. Every commitment in the deck maps to
code that keeps it, or to a boundary stated plainly (Aadhaar/land-record access, real
DBT disbursement, DLT template registration — policy, not engineering).

---

## L7 build note — trust & operations

Everything the deck promises that the six core levels had not yet wired.

| Deck requirement | Shipped |
| --- | --- |
| "every grievance tied to a lot ID" (slide 5 governance) | `POST /grievances` ties a complaint to the farmer's own receipt/booking; district resolves via `/district/grievances/:ref/resolve`; audited |
| "no-shows drain the slots → slot returns to the reserve; repeated no-shows lower the priority score" (slide 4) | `sweepNoShows()` returns the seat + entitlement and applies the published penalty; runs every 15 min on the worker and via `/op/sweep` |
| "6-hour first refusal" cleanup | `releaseExpiredHolds()` reopens held capacity once the window lapses |
| Impact numbers (slide 5) — measured | `GET /district/:d/impact` computes median wait, peak-to-average, failures-surfaced-in-24h and knew-their-turn from real rows, beside the targets |
| Farmer home screen (Sunrise 02) | `GET /dashboard` — profile, next appointment, live queue, procurement value, payment to watch, unread count, in one call |
| "DBT reconciliation worker", "District dashboard" run on a clock | `src/worker.ts` — a real BullMQ process on Redis; maintenance/15m + rate-ingest daily, verified scheduling and executing |

Every scheduled job is the same function as its manual admin endpoint, so behaviour is
identical whether fired by the clock or by hand — no dead buttons, no demo-only paths.
