# SMART INDIA HACKATHON 2025

**Problem Statement ID:** SIH26032
**Problem Statement Title:** Farmers often face long waiting times, lack of information regarding procurement schedules, and uncertainty about procurement status
**Theme:** Agriculture, FoodTech & Rural Development
**PS Category:** Software
**Team ID:** 3
**Team Name:** Coding Mavericks

---

## Idea Title

### Proposed Solution
**KisanQ** — one platform for the farmer's whole trip to the procurement centre: sign in once with a mobile OTP, book a capacity-bound slot, follow a live token queue with a real ETA, and track quality → weight → receipt → DBT payment on a single timeline. **SMS and IVR first; the app is the enhancement.**

Farmer PWA · SMS reply "1" · missed-call IVR — works on a feature phone, in the farmer's language (Punjabi / Hindi / English).

**Flow:** 1. Sign in → 2. Book slot → 3. Gate check-in (OTP + vehicle) → 4. Live queue → 5. Weigh & receipt → 6. Get paid

### How it addresses the problem
- **Everyone arrives on day one** → capacity-bound 2-hour slots with a trolley and quintal quota per window; **15% held back** for walk-ins and re-bookings, **30% reserved** for holdings under 2 ha until 24 h before.
- **No idea when the turn will come** → live token position and ETA on SMS/app, a "5 tokens away" alert, and an unauthenticated display board at the gate.
- **Payment is a black box** → one lot timeline: booked → checked-in → served → weighed → receipt → DBT initiated → **credited / failed**, with the failure reason in plain words, in the farmer's language.
- **Centre has no forecast** → offline operator console plus a district dashboard of bookings against bags, storage, and lorries, with payment-pendency ageing against the 48-hour promise.

### Current Situation vs. With KisanQ
| Current Situation | With KisanQ |
|---|---|
| Long unpredictable queues | Scheduled, capacity-bound time-slot booking |
| No visibility of procurement schedule | Real-time token position & wait-time ETA |
| Manual paper tokens | Digital token issued at the gate (OTP + vehicle) |
| Uncertainty about payment status | Live 6-state payment tracking via SMS / app |
| Wasted farmer time & fuel | Slot windows flatten the dawn rush |

### Innovation and Uniqueness of the Solution
- **Capacity = min(weighbridge, gunny bags × 0.5 qtl, godown headroom)** — bags run out long before the weighbridge does; other systems only count the weighbridge. *(Implemented as the slot-generation rule.)*
- **Queue sorted by slot window, then check-in time** — reaching the gate at 3 AM buys nothing, so the dawn rush disappears. Arriving late puts you at the back of *your own* window, never the back of the day.
- **ETA from a rolling mean of the last 20 lots** at that centre, re-computed on every weighment — not a fixed guess.
- **Feature-phone first** — reply "1" by SMS to accept a rescheduled slot; a missed call triggers an IVR that reads status aloud.
- **Booking cannot oversell** — every booking takes a row lock on the centre-day (`SELECT … FOR UPDATE`), proven by a concurrency test: 50 simultaneous requests at one 10-seat slot → exactly 10 succeed.
- **Offline-first operator console**; OTP + vehicle number at the gate makes a token worthless to resell; quantity is capped by the land record.

---

## Technical Approach

### Technologies Used *(as built)*
- **Farmer:** PWA (React + Vite), Punjabi / Hindi / English, phone-first "Sunrise" UI; SMS / IVR channel with DLT-registerable templates.
- **Operator:** offline-first console (idempotent batch sync by client UUID; server merges by centre + date). Android/SQLite packaging is the next step; the sync contract is already built.
- **Backend:** Node.js + **Fastify** REST API (TypeScript), **PostgreSQL 16** (transactional, row-locked booking), **Redis**, **SSE** for the live queue and gate board, background **worker** for SMS + reconciliation.
- **Slot engine:** capacity = min(lanes × hours ÷ service time, gunny bags × 0.5 qtl, godown headroom); reserve and small-holder pools release at T-24h.
- **Auth:** **mobile OTP** (E.164, hashed codes, attempt-limited, rotating refresh token with family revocation). Aadhaar / land record modeled as an **opaque entitlement source** — real eKYC needs an AUA/KUA licence, so the number stays a reference and the entitlement logic is real behind it.
- **Integrations (adapter seams):** SMS/IVR gateway (**MSG91** DLT driver built; stub driver for demo), **DBT–PFMS** payment status via a bank return-file reconciliation worker, **e-NAM / data.gov.in** mandi rates ingest.
- **Admin:** district dashboard — utilisation, bag / storage warnings, payment pendency; a full admin console over every entity (farmers, centres, bookings, queue, lots, payments, messages, rates, disruptions, grievances, audit log).
- **Hardware:** one tablet and one TV board per centre; nothing new for the farmer to buy.

### System Architecture Layers
- **User Layer:** Farmer PWA (vernacular UI), Feature Phone (SMS / IVR), Operator console (offline-first), District & Admin dashboards (web).
- **API / Backend Layer:** Auth service (mobile OTP), Slot booking & queue engine (server-authoritative, sole writer of bookings and tokens), Notification service (SMS / IVR / push — every message persisted), Payment tracking & reconciliation, Disruption / reschedule engine, Grievance service.
- **Data Layer:** PostgreSQL (14 tables — users, holdings, centres, centre_days, slots, bookings, tokens, service_events, lots, payments, messages, rates, grievances, audit_log …), Redis (rate limits, live queue fan-out, job queue).
- **External Integrations:** SMS/IVR gateway (MSG91), PFMS (MSP disbursal status), e-NAM / data.gov.in (mandi prices).

### Methodology and Process for Implementation
**Farmer flow:** Harvest ready → Book slot (SMS gate-OTP received) → Reach gate, check-in with OTP + vehicle number → Token issued → Wait for token call ("5 away" SMS) → Hand over produce → Weigh & grade → (Rejected → rejection SMS) OR (Receipt → DBT initiated → credited / failed + fix).

**Procurement-centre flow:** Validate booking at gate → Issue token → Call next token (writes a service event → refreshes ETA) → Weigh & grade → Quality OK? → (No → rejection SMS) / (Yes → net quintals × MSP → immutable receipt → trigger payment → SMS update).

### Rules that Keep it Fair *(served from the same constants the engine uses)*
- Order = (slot window, check-in time). Late → back of your own window, not the back of the day.
- Rained-out farmers get a **6-hour first refusal** on released slots (enforced by a slot-hold, not a promise).
- **30% of slots reserved** for holdings under 2 ha until 24 h before the day; **15% reserve** absorbs spill-over.
- ETA = tokens ahead ÷ active lanes × rolling mean service time.
- Repeated **no-shows lower a published priority score** — a rule, not a hidden algorithm; the fairness rules are exposed at a public endpoint so the page can never drift from the code.

### What the Farmer Receives (Sample SMS — generated by the running system)
- ਪਰਚੀ ਪੱਕੀ — Jagraon Procurement Centre, Saturday 12 September, 8:00–10:00. ਗੇਟ OTP 8988. *(slot confirmed + gate OTP)*
- आपका नंबर 5 गाड़ी बाद. कृपया लेन 3 पर पहुँचें. *(5 tokens away — go to lane 3)*
- भुगतान रुका — खाते से आधार लिंक नहीं. शाखा में KYC कराएँ. *(payment failed + the exact fix)*
- Reply 1 to accept a new slot · missed call → IVR reads status aloud

### Implementation Status — What Is Built and Proven
*A working system, not a slide-deck concept.*
- ✅ **Mobile-OTP sign-in** — request → hashed code → verify → JWT; attempt-limited, rotating refresh. *Tested end-to-end.*
- ✅ **Booking fires an SMS to the registered number the instant it is confirmed** — trilingual, persisted, with the gate OTP. *Tested end-to-end against PostgreSQL.*
- ✅ **Capacity-safe booking** — transactional row lock; the 50-request / 10-seat concurrency test passes.
- ✅ **Gate check-in → token → live queue → ETA → SSE board**, "ring my phone" watcher.
- ✅ **Lots → immutable receipt → DBT payment state machine → bank return-file reconciliation** with plain-language failure reasons.
- ✅ **Rates, voice assist (turn / money / rate intents), district read-models, disruption + reschedule engine, offline operator sync, grievances tied to a lot ID.**
- ✅ **19 backend test files**; farmer PWA (8 screens) + admin console.
- 🔜 **Remaining for production:** point the farmer PWA at the live API (auth + booking underway), a real MSG91 authkey + DLT-approved templates for physical SMS delivery, and the PFMS / e-NAM production credentials.

---

## Feasibility and Viability

### Analysis of the Feasibility of the Idea
- **Builds on what exists:** e-Uparjan (MP), Meri Fasal Mera Byora (Haryana), and Token Tuhar (Chhattisgarh) already register farmers and issue dates — KisanQ adds the missing **queue, live status, and payment** layer.
- **Low cost:** open-source stack; SMS ≈ ₹0.15–0.20 per message; one tablet and one TV per centre.
- **Data is available:** land records and farmer IDs already drive MSP registration and DBT payments.
- **Time-feasible:** booking → operator console → live queue is demonstrable today; dashboards and IoT follow in phases.
- **Scales centre by centre:** every mandi runs independently; offline-first design tolerates rural connectivity.
- **Adoption path:** pilot one district for one season; SMS-only farmers need no app at all.

### Potential Challenges and Risks → Strategies for Overcoming Them
| Challenge / Risk | Strategy |
|---|---|
| Rain, a full godown, or a bag shortage collapses the day's schedule | `centre_event` → automatic reschedule offers; the farmer replies "1" to accept; the 15% reserve absorbs the spill-over; a 6-hour hold gives affected farmers first refusal |
| Farmers without smartphones or reading literacy | SMS-first with reply-by-digit, missed-call IVR in the local language, assisted booking at panchayat / CSC |
| No network at the centre for hours at a time | Operator console is fully offline; token order is centre-local; syncs on reconnect and the server merges by centre + date (idempotent on client UUID) |
| Token resale, proxy farmers, traders posing as growers | OTP on the registered mobile + vehicle number at the gate; quantity capped by the land record; gate OTP is hashed, never resellable |
| Farmers do not trust the algorithm | Published fairness rules served from the engine's own constants; anonymised token ledger per centre per day; small-holding reservation |
| No-shows drain the slots | Slot returns to the reserve within the grace window; repeated no-shows lower the priority score |
| Real Aadhaar eKYC needs an AUA/KUA licence a student team cannot hold | Aadhaar / land record is an opaque entitlement reference; the entitlement and anti-proxy logic is real behind it; DigiLocker / KYC-sandbox is the drop-in for a licensed deployment |

### Why Weather is a Viability Question
Ludhiana, 5 Oct 2025 — 4.4 mm of rain; the only shed held cement trucks and paddy sat under tarpaulins (The Tribune). A schedule that cannot re-plan itself fails on the first rain day — hence the reschedule engine and the reserve pool.

Karnal district, 15 Oct 2024 — 1,73,146 MT of procured paddy still lying in the mandis; farmers unloading on the road (The Tribune).

---

## Impact and Benefits

### Potential Impact on the Target Audience
- **2–5 days → under 90 min:** wait at the centre — no more sleeping beside the trolley
- **3.8× → 1.3×:** peak-to-average arrivals once slots spread the demand
- **Silent → tracked:** payment status; failure reason surfaced within 24 h
- **0 → 100%:** farmers who know their turn before leaving home

**Impact of KisanQ (four dimensions):** Governance (real-time data for policy decisions), Social (reduced stress, greater trust), Economic (saved time, faster payments), Environmental (less fuel waste, less paper use)

### Why It Matters — From the Ground
- Medak, 29 May 2026 — his serial number was 115; the centre had reached 88 after several days. He had a number, but no ETA (Telangana Today).
- Yadadri Bhongir, 7 Nov 2024 — promised 48 h, unpaid after 10 days, told "technical reasons" (Telangana Today).

### Benefits of the Solution

**Social**
- Dignity and safety — no days and nights in the yard; the deaths recorded at centres in 2020, 2025, and 2026 were all tied to waiting.
- Works for feature-phone, low-literacy farmers, in their own language.

**Economic**
- Fewer distress sales — in Sehore (Apr 2026) a farmer sold at ₹2,000 against the ₹2,625 MSP rather than keep waiting.
- Trolley hire and lost workdays saved; payment failures fixed in days, not weeks.

**Environmental**
- Less grain spoiled by rain on open roads; fewer kilometres of idling tractors queued on highways.
- Faster mandi clearance → wheat sown on time → less pressure to burn stubble.

**Governance**
- A real arrival forecast lets the centre pre-position bags, labour, and lorries.
- Audit trail of quality readings, receipts, and payments; every grievance tied to a lot ID.

---

## Research and References

### A. Ground Research — What the Record Shows
- Karnal, 27 Oct 2025 — gate passes withheld for four days; tractor queue about 2 km on the NH-44 service road (The Tribune)
- Karnal, 15 Oct 2024 — 2,75,499 MT procured, ~63,000 MT lifted; paddy unloaded on roads (The Tribune)
- Patiala & Jalandhar, 22 Oct 2024 — six days at the mandi with bedding and utensils (The Tribune)
- Medak, 29 May 2026 — serial no. 115, centre had reached 88; farmer attempted suicide (Telangana Today)
- Yadadri Bhongir, 7 Nov 2024 — unpaid after 10+ days against the 48-hour DBT promise (FCI tweet) (Telangana Today)
- Madhya Pradesh, 11 Apr 2026 — 1.20 lakh of the 3.12 lakh gunny-bag bales needed were in stock; a centre had three days' supply (Ground Report)
- Ludhiana, 5 Oct 2025 — shed occupied by cement trucks while paddy sat under tarpaulins in rain (The Tribune)
- Dewas, 1 Jun 2020 — reached the centre on the given date, died in the queue two days later (ANI / Siasat)
- Chhattisgarh, 14 Dec 2025 — Token Tuhar app made 24×7 after a farmer's suicide attempt over a token (ETV Bharat)

### B. Existing Systems Studied
- MP e-Uparjan — slot booking for wheat/paddy (mpeuparjan.nic.in)
- Haryana Meri Fasal Mera Byora / e-Kharid — gate pass (fasal.haryana.gov.in)
- Chhattisgarh Token Tuhar app — date tokens (Google Play: com.nic.kisaan)
- Odisha PPAS — token system (ppas.pdsodisha.gov.in)
- FCI DBT, "One Nation One MSP", 48-h payment (pib.gov.in, PRID 1656291)

### C. Policy and Legal
- Parliamentary Standing Committee on Agriculture, Dec 2024 — timely payment, transparent procurement (thewire.in)
- Punjab & Haryana High Court, Oct 2024 — status report on lifting last season's paddy (livelaw.in)
- FCI uniform specifications — moisture: paddy ≤ 17%, wheat ≤ 12%

### D. Video Ground Reports
- Idi Sangathi — farmers waiting 40 days at buying centres (YouTube: zj3XDHFrwbo)
- Sakshi TV — 300 loaded tractors waiting for procurement (YouTube: Aa_lyePw5lg)
