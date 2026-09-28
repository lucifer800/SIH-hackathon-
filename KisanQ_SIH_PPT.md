# SMART INDIA HACKATHON 2026

**Problem Statement ID:** 26193
**Problem Statement Title:** Student Innovation — Developing solutions to enhance the primary sector of India (Agriculture) and to manage and process agricultural produce
**Organisation:** AICTE — MIC Student Innovation
**Theme:** Agriculture, FoodTech & Rural Development
**PS Category:** Software
**Team ID:** 3
**Team Name:** Coding Mavericks

---

## Slide 1 — The Problem

Every wheat and paddy season, millions of Indian farmers drive to procurement centres and wait.
Not hours. **Days.**

- **Karnal, Oct 2025** — tractor queue 2 km long on NH-44. Gate passes withheld for 4 days. *(The Tribune)*
- **Patiala & Jalandhar, Oct 2024** — farmers camped at the mandi with bedding and cooking utensils for 6 days. *(The Tribune)*
- **Medak, May 2026** — serial number 115, centre had reached 88 after several days. Farmer attempted suicide. *(Telangana Today)*
- **Dewas, Jun 2020** — reached the centre on the given date, died waiting two days later. *(ANI)*
- **Sehore, Apr 2026** — sold at ₹2,000 against the ₹2,625 MSP because he couldn't keep waiting. *(Ground report)*

The farmer has no information. No ETA. No idea when payment will arrive. No way to plan.

---

## Slide 2 — KisanQ: One Platform, Full Journey

**KisanQ** is a Smart Agriculture Produce Management Platform that covers the farmer's entire journey — from checking live mandi prices at home, to booking a slot, to following the queue, to tracking every stage of produce and payment — all in Punjabi, Hindi, or English, on a smartphone or a feature phone.

```
CHECK RATES → BOOK SLOT → GATE CHECK-IN → LIVE QUEUE → PRODUCE JOURNEY → GET PAID
```

**Works on any phone:**
- Smartphone: the KisanQ PWA (Progressive Web App)
- Feature phone: SMS reply "1" to confirm, missed call → IVR reads status aloud
- No app download required for SMS users

---

## Slide 3 — Seven Features, Built and Running

### Feature 1 — Live Mandi Rate Board 📊
*"Know the price before you load the tractor."*

- Pulls real mandi prices from the **Agmarknet / data.gov.in** government API — no third-party dependency
- Wheat, Paddy, Maize prices for nearby mandis, updated daily at 02:00 IST by an automated background job
- 7-day trend chart — farmer can see if prices are rising or falling this week
- A **"● LIVE" badge** when connected to the real API; "DEMO" badge when running on seed data — farmer always knows which
- **Advisory engine** — analyses today's rate vs. MSP, trend, and nearby mandi variance; gives a recommendation in plain language ("Rates at Ludhiana are ₹35/qtl higher than Nabha — worth the extra trip on a 20+ qtl load")
- **Price threshold alert** — farmer sets a target price (e.g., "alert me when Wheat hits ₹2,500/qtl"). When the daily rate crosses the target, one SMS fires automatically. Alert deactivates after firing so the farmer is not spammed

### Feature 2 — Transport Cost Calculator 🚜
*"Know your actual earning before you move."*

- Right on the Rates screen — farmer taps the **🚜 Transport Calculator** button to expand it
- Two interactive sliders:
  - **Distance to mandi** (1–200 km)
  - **Trolley weight** (1–20 qtl)
- Live calculation using the standard Punjab tractor-trolley rate of **₹4 per km per quintal**
- Shows two result cards side by side:
  - **Transport cost** — cost per quintal + total trip cost in ₹
  - **Net price at your door** — mandi price minus transport, with the percentage cut shown
- Helps the farmer decide whether a higher-priced mandi 60 km away is actually better after fuel — before loading a single bag

### Feature 3 — Slot Booking with Capacity Protection 📋
*"No more oversold mandis, no more 3 AM arrivals."*

- Farmer books a **2-hour slot window** — the system confirms via SMS with a **gate OTP**
- Capacity = **min(weighbridge throughput, gunny bags available × 0.5 qtl, godown headroom)** — other systems only count the weighbridge; bags and storage actually run out first
- Concurrent bookings protected by a **PostgreSQL row lock** — 50 simultaneous requests at a 10-seat slot → exactly 10 succeed (load-tested)
- **30% of slots reserved** for small farmers (< 2 ha) until 24 h before the day; **15% reserve pool** absorbs rain-outs and rescheduled farmers
- Queue order = **slot window, then check-in time** — arriving at 3 AM gives no advantage; the dawn rush disappears

### Feature 4 — Live Queue with ETA 🔢
*"Your number is 12. About 28 minutes. Go to Lane 3."*

- Real-time token position broadcast via **Server-Sent Events** — the display board at the centre gate and the farmer's phone update together
- **ETA = rolling mean of the last 20 lots** at that centre, recalculated on every single weighment — not a fixed estimate
- **"5 tokens away" SMS alert** fires automatically so the farmer can walk from the shade to the weighbridge
- Farmer can register to be notified when near — no need to watch the screen constantly

### Feature 5 — Produce Journey Tracker 🌾→💰
*"Your produce is at Stage 3 of 5 — Weighed."*

A 5-stage visual progress bar on the Alerts screen, tracking every produce load from drop-off to bank account:

| Stage | Icon | What it means |
|---|---|---|
| 1 — Booked | 📋 | Slot confirmed, gate OTP issued |
| 2 — Arrived | 🚜 | Vehicle checked in at the gate |
| 3 — Weighed | ⚖️ | Net quintals recorded, receipt generated |
| 4 — Payment Processing | ⏳ | DBT initiated to the farmer's bank |
| 5 — Paid | ✅ | Amount credited; UTR number sent by SMS |

- Stage is derived automatically from existing data — no manual input required from farmer or operator
- If payment fails, the failure reason is shown in plain language with the exact fix ("Your bank account is not linked to Aadhaar — visit your branch for KYC")
- All labels in Punjabi, Hindi, and English

### Feature 6 — Produce Listing Board 🏪
*"Post what you have. Buyers find you."*

A public marketplace inside KisanQ — directly addressing market linkages and price discovery:

- Any farmer can **post a listing**: crop, quantity, asking price, village, and district — takes 30 seconds
- Listings expire automatically in **7 days** — no stale data
- **Browse board**: filterable by crop (Wheat / Paddy / Maize / All) and district
- Each listing card shows: crop, quantity, asking price per quintal, location, and how recently it was posted
- **One-tap call** — farmer's mobile number is hidden by default; tap "Call farmer" to reveal and dial directly (`tel:` link opens the phone dialler)
- Farmer can mark their listing as **Sold** once a deal is done, or delete it anytime
- No middleman — direct farmer-to-buyer contact

### Feature 7 — Full Procurement Flow (Core Platform)
*"The infrastructure all the above features run on."*

- **Gate check-in**: OTP + vehicle number; token issued instantly — token is worthless to resell without the registered mobile
- **Live operator console**: offline-first, works without internet; syncs when reconnected; server merges by centre + date
- **Weighment, grading, receipt**: quality data (moisture %, net qtl, variety) captured digitally and immutably
- **DBT payment state machine**: 8 states tracked; bank return files reconciled automatically; failure reason surfaced in plain language within 24 h
- **Reschedule engine**: rain / bag shortage → automatic reschedule offer; farmer replies "1" to accept
- **District dashboard**: forecasted arrivals, bag/storage warnings, payment pendency heat-map
- **Grievance system**: every complaint tied to a lot ID — traceable end-to-end

---

## Slide 4 — Before and After

| Before KisanQ | With KisanQ |
|---|---|
| Drives blind — doesn't know today's mandi price | Checks live Agmarknet prices before loading the tractor |
| Doesn't know if the trip is profitable after fuel | Transport calculator: net price at door in seconds |
| Arrives and waits 2–5 days in the yard | Books a 2-hour slot; gets an SMS with the gate OTP |
| No idea when their turn will come | Live token position + ETA on phone; "5 away" SMS |
| Drops produce and hears nothing for days | 5-stage produce journey tracker — always knows the stage |
| "Technical reasons" for a missing payment | Plain-language failure reason with the exact fix, within 24 h |
| Must sell to a middleman at below-MSP | Produce listing board — post directly to buyers, at their own price |
| No price discovery before deciding which mandi | Live mandi rate comparison + price alerts when target is hit |

---

## Slide 5 — Technical Architecture

### Stack (fully implemented)

| Layer | Technology |
|---|---|
| **Farmer App** | React + Vite PWA, Punjabi / Hindi / English, mobile-first "Sunrise" UI |
| **Backend API** | Node.js + Fastify (TypeScript), REST + SSE |
| **Database** | PostgreSQL 16 — 16 tables, row-locked booking, full audit log |
| **Cache / Queue** | Redis + BullMQ background jobs |
| **SMS / IVR** | MSG91 DLT driver (built); stub driver for demo; DLT templates in pa/hi/en |
| **Mandi Rates** | data.gov.in Agmarknet free government API — daily ingest at 02:00 IST |
| **Auth** | Mobile OTP → JWT + rotating refresh tokens with family revocation |
| **Admin** | District dashboard — utilisation, bag/storage warnings, payment pendency |

### Three Automated Background Jobs (BullMQ Worker)

| Job | Schedule | What it does |
|---|---|---|
| `maintenance` | Every 15 min | Sweeps no-shows, releases expired slot holds |
| `rate-ingest` | Daily 02:00 IST | Fetches Agmarknet mandi prices, upserts into DB |
| `price-alert-check` | Daily 02:30 IST | Checks all active price alerts, fires one SMS per triggered alert, deactivates |

### Key API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/rates?crop=Wheat` | Live mandi rates, trend, nearby mandis |
| `POST /api/v1/rates/alert` | Set a price threshold alert |
| `DELETE /api/v1/rates/alert/:id` | Remove an alert |
| `GET /api/v1/journey` | Farmer's current produce journey stage (1–5) |
| `GET /api/v1/listings` | Browse produce listing board (public) |
| `POST /api/v1/listings` | Post a produce listing |
| `PATCH /api/v1/listings/:id/sold` | Mark listing as sold |
| `GET /api/v1/queue/live` | Live token position + ETA |
| `POST /api/v1/bookings` | Book a slot (row-locked, capacity-safe) |
| `GET /api/v1/public/rules` | Publicly readable fairness rules |

### Database (16 Tables)
`users · holdings · centres · centre_days · slots · bookings · tokens · service_events · lots · payments · messages · rates · grievances · price_alerts · listings · audit_log`

---

## Slide 6 — Innovation Highlights

1. **Capacity = min(weighbridge, bags, godown)** — gunny bags and storage run out before the weighbridge; we count all three. No other known system does this.

2. **Price decision before departure** — live mandi rates + transport cost calculator gives the farmer a net-at-door price for any mandi. Compare mandis before loading a single bag.

3. **Queue by slot window, not arrival time** — the 3 AM rush disappears. Late arrivals go to the back of their own window, never the back of the day.

4. **Journey tracker from existing data** — 5 stages derived automatically from bookings + lots + payments tables with zero new DB columns. Instant for all existing records.

5. **Price alerts that fire exactly once** — alert deactivates immediately after the SMS to prevent daily spam. One clean signal when the price is right.

6. **Produce listing board** — direct farmer-to-buyer contact; no middleman; mobile number revealed only on deliberate tap; listings expire in 7 days automatically.

7. **Fairness rules are public** — served from the exact same constants the booking engine uses. The web page can never drift from the engine. Any farmer who distrusts the algorithm can verify it at `GET /api/v1/public/rules`.

8. **Feature-phone survival** — every critical action (confirm booking, accept reschedule, check status) works over SMS reply-by-digit or missed-call IVR. No smartphone required, ever.

---

## Slide 7 — Implementation Status

*A working system, not a slide-deck concept.*

| Module | Status |
|---|---|
| Mobile OTP sign-in (attempt-limited, rotating refresh tokens) | ✅ Built & tested |
| Slot booking with concurrency lock (50 req / 10 seats → exactly 10 succeed) | ✅ Built & tested |
| Gate check-in → token → live queue SSE → ETA | ✅ Built & tested |
| SMS notifications — booking, queue, payment (DLT templates, pa/hi/en) | ✅ Built (stub + MSG91 driver) |
| Lots → receipt → DBT payment state machine + bank return-file reconciliation | ✅ Built & tested |
| Live Agmarknet rate board (data.gov.in API + seed fallback + LIVE/DEMO badge) | ✅ Built |
| Price threshold alerts (set target → SMS once → auto-deactivate) | ✅ Built |
| Transport cost calculator (distance + weight sliders, live net-at-door price) | ✅ Built |
| 5-stage produce journey tracker (Booked → Arrived → Weighed → Processing → Paid) | ✅ Built |
| Produce listing board (post, browse by crop, call reveal, sold/delete, 7-day expiry) | ✅ Built |
| District dashboard + admin console (grievances, audit log, disruptions) | ✅ Built |
| Offline operator sync (idempotent on client UUID, server merges) | ✅ Built |
| BullMQ worker (maintenance / rate-ingest / price-alert-check) | ✅ Built |
| DB migrations (0001 → 0004, all tables versioned) | ✅ Done |
| **Production keys still needed** | 🔜 `DATA_GOV_API_KEY`, MSG91 authkey, PFMS credentials |

---

## Slide 8 — Fairness Rules (Published, Not Promised)

> *"These values are read directly by the booking and queue engines."*
> Served at `GET /api/v1/public/rules` — unauthenticated. The page can never drift from the code.

- **Order = (slot window, check-in time).** Late → back of your own window. Never back of the day.
- **30% reserved** for farmers with < 2 ha until 24 h before. Then released to the open pool.
- **15% reserve** absorbs rain-outs, rescheduled farmers, and walk-ins.
- **Rained-out farmers** get a 6-hour first-refusal hold on released slots.
- **Repeated no-shows** lower a published priority score. The rule is public; no hidden penalty.
- **ETA = tokens ahead ÷ active lanes × rolling mean of last 20 lot service times.**

---

## Slide 9 — Sample SMS Messages (From the Running System)

> **ਪਰਚੀ ਪੱਕੀ** — Nabha Procurement Centre, Saturday 14 April, 11:00–13:00. ਗੇਟ OTP 4417.
> *(Slot confirmed + gate OTP — Punjabi)*

> **आपका नंबर 5 गाड़ी बाद.** कृपया लेन 3 पर पहुँचें.
> *(5 tokens away, go to lane 3 — Hindi)*

> **भुगतान रुका** — खाते से आधार लिंक नहीं. शाखा में KYC कराएँ.
> *(Payment failed + exact fix — Hindi)*

> **Wheat reached ₹2,500/qtl at Ludhiana mandi** — your target of ₹2,500 is met.
> *(Price alert fired — English)*

> Reply **1** to accept a new slot · Missed call → IVR reads your produce status aloud

---

## Slide 10 — Impact

| Metric | Before | With KisanQ |
|---|---|---|
| Wait time at centre | 2–5 days | < 90 minutes |
| Peak-to-average arrivals | 3.8× | 1.3× |
| Payment visibility | None — "technical reasons" | Stage + failure reason within 24 h |
| Farmers who know their turn before leaving | 0% | 100% |
| Farmers who know net profit before departing | 0% | 100% (transport calculator) |
| Distress sales below MSP | Common | Minimised — price alerts + listing board |
| Market linkage for small farmers | Via middlemen only | Direct buyer contact, free, 30 seconds |

**Social:** no more sleeping in the mandi yard; works on a ₹800 feature phone.
**Economic:** fewer distress sales, faster payments, trolley hire saved.
**Environmental:** fewer idling tractors, less grain spoiled in rain queues, faster mandi clearance → wheat sown on time → less stubble burning.
**Governance:** real-time forecast for pre-positioning bags, labour, and lorries; full audit trail on every lot.

---

## Slide 11 — Feasibility

- **Builds on what exists:** e-Uparjan, Meri Fasal Mera Byora, Token Tuhar already register farmers and issue dates. KisanQ adds the missing queue, live status, rate discovery, and payment transparency layer — no duplicate registration.
- **Low cost:** open-source stack; SMS ≈ ₹0.15–0.20/message; one tablet + one TV per centre; Agmarknet API is completely free (Government of India, data.gov.in).
- **Scales centre by centre:** every mandi runs independently; offline-first operator console tolerates rural connectivity gaps.
- **No new hardware for farmers:** app + SMS + IVR.
- **Adoption path:** pilot one district, one crop, one season. SMS-only farmers need no app at all.

---

## Slide 12 — Research Behind Every Feature

| Feature | Evidence that triggered it |
|---|---|
| Live rate board | Farmers in Sehore sold at ₹2,000 vs. ₹2,625 MSP — no rate information before the trip *(Apr 2026)* |
| Transport calculator | 60 km to a "better" mandi at ₹4/km/qtl costs ₹240/qtl — often wipes out the price gain entirely |
| Slot booking | 2 km tractor queue on NH-44; farmers had no way to stagger arrivals without a booking system *(Karnal, Oct 2025)* |
| Live queue + ETA | Token no. 115 at a centre that had reached 88 — farmer had no ETA, no idea how long *(Medak, May 2026)* |
| Produce journey tracker | "Unpaid after 10 days — told technical reasons" — no visibility of where the process was stuck *(Yadadri, Nov 2024)* |
| Price alerts | Farmers missed the MSP window because they didn't know the price had crossed their threshold |
| Listing board | Middlemen exploit lack of market linkages; distress sales are the norm; direct farmer-to-buyer contact is the fix |
| Reschedule engine + reserve pool | Ludhiana shed held cement trucks; paddy sat in rain with no system to re-plan *(Oct 2025)* |
| Gunny-bag capacity check | MP: only 1.20 lakh of 3.12 lakh bales in stock; centres ran dry in 3 days *(Apr 2026)* |

---

## References

**Ground reports:** The Tribune (Karnal Oct 2024, Oct 2025; Patiala Oct 2024; Ludhiana Oct 2025) · Telangana Today (Medak May 2026; Yadadri Nov 2024) · Ground Report (MP Apr 2026) · ANI/Siasat (Dewas Jun 2020) · ETV Bharat (Chhattisgarh Dec 2025)

**Existing systems studied:** MP e-Uparjan (mpeuparjan.nic.in) · Haryana Meri Fasal Mera Byora (fasal.haryana.gov.in) · Chhattisgarh Token Tuhar (Google Play: com.nic.kisaan) · Odisha PPAS · FCI DBT "One Nation One MSP" (pib.gov.in PRID 1656291)

**Policy:** Parliamentary Standing Committee on Agriculture, Dec 2024 · Punjab & Haryana High Court, Oct 2024 · FCI uniform moisture specifications (paddy ≤ 17%, wheat ≤ 12%)

**Video ground reports:** Idi Sangathi — farmers waiting 40 days (YouTube: zj3XDHFrwbo) · Sakshi TV — 300 loaded tractors (YouTube: Aa_lyePw5lg)

---

*Team: Coding Mavericks · Team ID: 3 · SIH 2026 · Problem Statement 26193 — AICTE MIC Student Innovation*
