# KisanQ

Procurement slot, queue and payment backend — SIH26032 (*"Farmers often face long
waiting times, lack of information regarding procurement schedules, and uncertainty
about procurement status"*).

Replaces the `KisanSetu` prototype's JSON-file backend with a Postgres-backed
Fastify service. Built in levels — see `docs/` links below.

**Status: L0–L7 complete. Backend feature-complete against the deck.**

## Run it

```bash
cp .env.example .env
npm install
npm run db:up          # postgres + redis in docker
npm run db:migrate
npm run db:seed        # three Ludhiana centres, 10 days of capacity, the demo farmer
npm run dev            # http://127.0.0.1:4000
```

```bash
curl http://127.0.0.1:4000/api/v1/health
curl http://127.0.0.1:4000/api/v1/health/deep   # also proves the DB connection
curl http://127.0.0.1:4000/api/v1/public/rules  # the published fairness rules
```

### Sign in (L1)

```bash
# 1. request a code — outside production the response carries devCode
curl -sX POST localhost:4000/api/v1/auth/otp/request \
  -H 'content-type: application/json' -d '{"mobile":"9876543210"}'

# 2. verify it
curl -sX POST localhost:4000/api/v1/auth/otp/verify \
  -H 'content-type: application/json' \
  -d '{"requestId":"<id>","code":"<devCode>","language":"pa"}'

# 3. use the access token
curl localhost:4000/api/v1/me -H 'authorization: Bearer <accessToken>'
```

Every code is also a real row in `messages` — the alerts screen is already true.

### Book a slot (L2)

```bash
# nearest centres (needs a bearer token)
curl localhost:4000/api/v1/centres -H 'authorization: Bearer <token>'

# real remaining capacity per 2-hour window, from this farmer's pools
curl "localhost:4000/api/v1/centres/<id>/slots?date=2026-09-12" -H 'authorization: Bearer <token>'

# book — Idempotency-Key is required; repeat it to replay, never to double-book
curl -sX POST localhost:4000/api/v1/bookings \
  -H 'authorization: Bearer <token>' -H 'idempotency-key: <uuid>' \
  -H 'content-type: application/json' -d '{"slotId":"<id>","qtl":12}'
```

The booking transaction takes `SELECT … FOR UPDATE` on the centre-day row, so a
slot can never be oversold. The gate test — 50 farmers, 10 seats, exactly 10
winners — is `tests/booking.concurrency.test.ts`.

### The live floor (L3)

```bash
# operator checks a farmer in at the gate → issues a token
curl -sX POST localhost:4000/api/v1/op/checkin \
  -H 'authorization: Bearer <operator token>' -H 'idempotency-key: <uuid>' \
  -H 'content-type: application/json' \
  -d '{"bookingRef":"KS-26-...","gateOtp":"8705","vehicleNo":"PB10AB1234","lane":1}'

# operator brings the next trolley — moves the whole line
curl -sX POST localhost:4000/api/v1/op/serve/next \
  -H 'authorization: Bearer <operator token>' -H 'content-type: application/json' \
  -d '{"centreId":"<id>","lane":1}'

# farmer watches their position live (SSE; token in query — EventSource can't set headers)
curl -N "localhost:4000/api/v1/queue/stream?token=<farmer access token>"

# the mandi-gate big screen — no auth
curl -N "localhost:4000/api/v1/public/board/<centreId>/stream"

# the anonymised, auditable order for the day
curl "localhost:4000/api/v1/public/board/<centreId>/ledger"
```

A token is born at the gate, not at booking — OTP + vehicle number proving the
registered farmer arrived, which is what makes a token worthless to resell. Queue
order is `(slot window, check-in time)`, so a late arrival drops to the back of
their *own* window, never the back of the day. Every ETA comes from a rolling mean
of the last 20 real service times.

### The money trail (L4)

```bash
# operator records the weighment → an immutable receipt + a pending payment
curl -sX POST localhost:4000/api/v1/op/lots \
  -H 'authorization: Bearer <operator>' -H 'idempotency-key: <uuid>' \
  -H 'content-type: application/json' \
  -d '{"bookingRef":"KS-26-...","moisturePct":11,"grossQtl":24.4,"tareQtl":0.4,"variety":"HD-2967"}'

# the DBT run: pending → initiated (starts the 48-hour clock)
curl -sX POST localhost:4000/api/v1/payments/initiate \
  -H 'authorization: Bearer <operator>' -d '{"centreId":"<id>"}'

# the bank return file settles each payment; a failure names the exact fix
curl -sX POST localhost:4000/api/v1/hooks/bank/return-file \
  -H 'authorization: Bearer <district>' -H 'content-type: application/json' \
  -d '{"rows":[{"receiptNo":"RC-...","status":"failed","bankCode":"ACCOUNT_NOT_LINKED"}]}'

# farmer side
curl localhost:4000/api/v1/lots      -H 'authorization: Bearer <farmer>'   # records
curl localhost:4000/api/v1/payments  -H 'authorization: Bearer <farmer>'   # tracker
curl localhost:4000/api/v1/messages  -H 'authorization: Bearer <farmer>'   # alerts log
```

A payment can only move `pending → initiated → credited | failed | returned`
(`failed`/`returned → initiated` for a retry). A failure never says "technical
reasons" — the bank code maps to a fix in the farmer's language and is sent as SMS,
so it lands in the alerts log within one reconciliation run. No real money moves;
the importer is driven by a sample file.

### Reach (L5)

```bash
# crop rates for the farmer (Sunrise 05) — today, 7-day trend, nearby mandis, advice
curl "localhost:4000/api/v1/rates?crop=Wheat" -H 'authorization: Bearer <farmer>'

# voice assist — three intents: turn, money, rate (Punjabi/Hindi/English)
curl -sX POST localhost:4000/api/v1/assist/ask -H 'authorization: Bearer <farmer>' \
  -H 'content-type: application/json' -d '{"text":"ਕਣਕ ਦਾ ਭਾਅ ਕੀ ਹੈ","language":"pa"}'

# operator declares a disruption → auto-reschedule offers with a 6h first refusal
curl -sX POST localhost:4000/api/v1/op/events -H 'authorization: Bearer <operator>' \
  -H 'content-type: application/json' -d '{"centreId":"<id>","date":"2026-09-10","kind":"rain"}'

# the feature-phone path: farmer replies "1" by SMS → booking moves onto the held slot
curl -sX POST localhost:4000/api/v1/hooks/sms/inbound \
  -H 'content-type: application/json' -d '{"from":"9876543210","text":"1"}'

# missed-call IVR → lines to read aloud in the farmer's language
curl -sX POST localhost:4000/api/v1/hooks/ivr -H 'content-type: application/json' -d '{"from":"9876543210"}'

# district dashboard
curl "localhost:4000/api/v1/district/Ludhiana/overview"  -H 'authorization: Bearer <district>'
curl "localhost:4000/api/v1/district/Ludhiana/forecast"  -H 'authorization: Bearer <district>'
```

Set `CHANNEL_DRIVER=msg91` and `SMS_API_KEY` to send real DLT SMS; the default stub
keeps every level demoable with no vendor account. The rain → reply-1 flow is the L5
gate: `tests/reach.flow.test.ts`.

### Field-hard (L6)

```bash
# operator pulls the day pack to run offline
curl "localhost:4000/api/v1/op/centre/<id>/day/2026-09-10" -H 'authorization: Bearer <operator>'

# on reconnect, replay the outbox — idempotent per operation clientUuid
curl -sX POST localhost:4000/api/v1/op/sync -H 'authorization: Bearer <operator>' \
  -H 'content-type: application/json' -d '{
    "centreId":"<id>","date":"2026-09-10",
    "operations":[
      {"clientUuid":"<uuid>","type":"checkin","bookingRef":"KS-26-...","gateOtp":"1234","vehicleNo":"PB10AB1234","lane":1,"at":"2026-09-10T08:05:00+05:30"},
      {"clientUuid":"<uuid>","type":"serve_next","lane":1}
    ]}'
```

The whole outbox can be replayed any number of times; each operation lands exactly
once, tokens keep their centre-local order via the client timestamp. Deploy config
is `render.yaml`; see [docs/deploy.md](docs/deploy.md) for hardening and go-live.

## Deploy

`render.yaml` is a Render Blueprint: one web service, managed Postgres 16, managed
Redis. `npm run db:migrate` runs on every release before the new version serves
traffic. Full instructions in [docs/deploy.md](docs/deploy.md).

## Background worker

`src/worker.ts` is a real BullMQ process (not a manual endpoint) running on the
provisioned Redis:

- **maintenance every 15 min** — sweep no-shows (return the seat + entitlement, drop
  priority), release expired first-refusal holds, expire stale reschedule offers.
- **rate ingest daily at 02:00 IST** — refresh mandi prices.

```bash
npm run worker        # or worker:dev with reload
```

The same operations are exposed as authenticated admin endpoints (`/api/v1/op/sweep`,
`/api/v1/admin/maintenance`, `/api/v1/rates/ingest`) — the schedule and the manual
trigger call identical code, so nothing is demo-only.

`npm run db:seed -- --reset` truncates first. `npm test` runs the suite.

## Levels

| Level | Name | State |
| --- | --- | --- |
| **L0** | Bench — schema, migrations, seed, health, tests, CI | **done** |
| **L1** | Identity — mobile + OTP, JWT + rotating refresh, roles | **done** |
| **L2** | Booking truth — capacity, pools, transactional booking | **done** |
| **L3** | Live floor — gate check-in, tokens, ETA, SSE | **done** |
| **L4** | Money trail — lots, receipts, DBT states, message log | **done** |
| **L5** | Reach — SMS/IVR, rates, voice assist, district, reschedule | **done** |
| **L6** | Field-hard — offline operator sync, hardening, deploy | **done** |
| **L7** | Trust & ops — grievances, no-show sweep, impact metrics, dashboard, worker | **done** |

A level is a claim about what is *true* in the system, and each has a gate — a test
you can run. L0's gate: `docker compose up` on a clean clone, then migrate, seed and
test, with no manual steps.

## Reference

[`docs/sih-alignment.md`](docs/sih-alignment.md) maps every commitment in the SIH deck
(`KisanQ_SIH_Idea.pptx`) to the code that keeps it — including the four things we
deliberately do not build, and why. Read it before adding a feature: if a change makes
a row in that table false, the change is wrong.

## Layout

```
src/
  env.ts              zod-validated environment, fails fast and loudly
  app.ts              Fastify wiring, one error envelope, health routes
  server.ts           listen + graceful shutdown
  db/
    schema.ts         every table, up front — later levels add logic, not tables
    client.ts         drizzle + postgres.js
    migrate.ts        applies ./drizzle
    seed.ts           imports the old prototype's store.json
  domain/
    capacity.ts       pure maths: min(weighbridge, bags, godown), slot planning
  lib/
    hash.ts           scrypt for OTPs, gate OTPs, refresh tokens
    ids.ts            booking refs and receipt numbers, no ambiguous characters
tests/                unit + route tests
seed/legacy-store.json   the prototype's data, kept as seed input
```

## Design notes carried from the prototype

- **The gate OTP is hashed.** In plain text a token is resellable, which is the
  exact fraud the SIH deck's check-in rule exists to prevent.
- **`centre_days` is the lock row.** Booking (L2) takes `SELECT … FOR UPDATE` on it.
  Everything about not overselling a slot depends on that one line.
- **Capacity is data, not code.** The prototype hard-coded three centres, six slot
  times, and one permanently-unavailable 3:00 PM. Here capacity comes from
  `min(weighbridge, gunny_bags × qtl_per_bag, godown_free_qtl)` per centre.
  The seed shows all three constraints binding on different centres.
- **CORS is an allow-list.** The prototype sent `Access-Control-Allow-Origin: *`
  on a bearer-token API.
- **Times are IST-anchored.** Slot windows are built from `+05:30`, never from the
  server's local clock.
- **The fairness rules are published from the same constants that enforce them.**
  `GET /api/v1/public/rules` serves `FAIRNESS_RULES` directly, so the rule on the page
  and the rule in the booking engine cannot drift apart. The deck's answer to *"farmers
  do not trust the algorithm"* only works if that is structurally true.

## Error shape

```json
{ "error": { "code": "SLOT_FULL", "message": "…", "details": [] },
  "requestId": "…" }
```

`code` is stable and machine-readable; `message` is the only field that gets
translated into Punjabi or Hindi.
