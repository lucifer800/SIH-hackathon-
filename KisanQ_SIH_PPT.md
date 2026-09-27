# SMART INDIA HACKATHON 2026

**Problem Statement ID:** 26193
**Problem Statement Title:** Student Innovation — Developing solutions to enhance the primary sector of India (Agriculture) and to manage and process agricultural produce
**Organisation:** AICTE — MIC Student Innovation
**Theme:** Agriculture, FoodTech & Rural Development
**PS Category:** Software
**Team ID:** 3
**Team Name:** Coding Mavericks

---

## Idea Title

### Proposed Solution
**KisanQ** — a Smart Agriculture Produce Management Platform that covers the farmer's entire journey: from checking live mandi prices at home, to booking a capacity-bound slot, to following a live token queue with a real ETA, to tracking the produce's journey (weighed → graded → payment) on a single timeline — all via SMS, IVR, or the app. **Feature-phone first, in the farmer's own language.**

Farmer PWA · SMS reply "1" · missed-call IVR — works on a feature phone, in the farmer's language (Punjabi / Hindi / English).

**End-to-end flow:**
1. **Check rates** — live mandi prices from Agmarknet; decide *where* to sell before leaving home
2. **Book slot** — capacity-bound 2-hour window; SMS confirms with gate OTP
3. **Gate check-in** — OTP + vehicle number; token issued instantly
4. **Live queue** — real token position & ETA; "5 away" SMS alert
5. **Produce journey** — tracker shows Booked → Arrived → Weighed → Payment Processing → Paid
6. **Get paid** — DBT directly to bank; failure reason in plain language if it falls through

### How it addresses the problem statement (SIH26193)
The AICTE PS asks for solutions that **enhance agriculture** and **manage/process agricultural produce**. KisanQ addresses both:

- **Enhance agriculture:** Live Agmarknet mandi rates in Hindi/Punjabi help farmers decide *which* mandi gives the best price before loading the tractor — reducing distress sales below MSP.
- **Manage agricultural produce:** End-to-end digital tracking from slot booking through weighment, quality grading, and DBT payment — replacing paper tokens, verbal updates, and phone calls with a transparent, auditable digital trail.
- **Process produce:** Weighment and quality data (moisture%, net qtl, variety) are captured digitally at the centre and immutably stored; operators can't change a receipt after it is issued.

### Current Situation vs. With KisanQ
| Current Situation | With KisanQ |
|---|---|
| Farmer doesn't know mandi prices before travelling | Live Agmarknet rates — check at home, choose the best mandi |
| Long unpredictable queues | Scheduled, capacity-bound time-slot booking |
| No visibility of procurement schedule | Real-time token position & wait-time ETA |
| Manual paper tokens | Digital token issued at the gate (OTP + vehicle) |
| No visibility of produce status after drop-off | 5-stage produce journey tracker (Booked→Arrived→Weighed→Processing→Paid) |
| Uncertainty about payment status | Live payment tracking via SMS / app with plain-language failure reasons |
| Wasted farmer time & fuel | Slot windows + pre-trip rate check flatten the dawn rush |

### Innovation and Uniqueness of the Solution

**New in this version (aligned to SIH26193):**
- **Live Agmarknet Rate Board** — pulls real mandi prices from data.gov.in's Agmarknet feed (free govt API, no third-party dependency); a "LIVE / DEMO" badge shows data freshness. The backend advice engine computes whether the extra travel to a higher-priced mandi is worth it on a 25-qtl load (gap × qtl vs. estimated travel cost) — decision help, not raw data.
- **5-Stage Produce Journey Tracker** — derived from existing DB tables (bookings → tokens → lots → payments) without any new DB columns. The tracker is shown on the Alerts screen in the farmer's language and works entirely offline for operators.

**Core platform innovations (unchanged):**
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
- **Integrations (adapter seams):** SMS/IVR gateway (**MSG91** DLT driver built; stub driver for demo), **DBT–PFMS** payment status via a bank return-file reconciliation worker, **Agmarknet / data.gov.in** live mandi rates (free govt API; seeded fallback when key absent).
- **Admin:** district dashboard — utilisation, bag / storage warnings, payment pendency; a full admin console over every entity (farmers, centres, bookings, queue, lots, payments, messages, rates, disruptions, grievances, audit log).
- **Hardware:** one tablet and one TV board per centre; nothing new for the farmer to buy.

### System Architecture Layers
- **User Layer:** Farmer PWA (vernacular UI), Feature Phone (SMS / IVR), Operator console (offline-first), District & Admin dashboards (web).
- **API / Backend Layer:** Auth service (mobile OTP), Slot booking & queue engine (server-authoritative, sole writer of bookings and tokens), Notification service (SMS / IVR / push — every message persisted), Payment tracking & reconciliation, Disruption / reschedule engine, Grievance service.
- **Data Layer:** PostgreSQL (14 tables — users, holdings, centres, centre_days, slots, bookings, tokens, service_events, lots, payments, messages, rates, grievances, audit_log …), Redis (rate limits, live queue fan-out, job queue).
- **External Integrations:** SMS/IVR gateway (MSG91), PFMS (MSP disbursal status), Agmarknet / data.gov.in (live mandi prices — free govt API).

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
- ✅ **Live Agmarknet Rate Board** — `GET /api/v1/rates` pulls from data.gov.in when `DATA_GOV_API_KEY` is set; seeded fallback otherwise. "LIVE / DEMO" badge on the farmer app. Decision-help advice engine built and tested.
- ✅ **5-Stage Produce Journey Tracker** — `GET /api/v1/journey` derives stage from existing tables (no new DB columns); displayed on the Alerts screen in all three languages with a step-progress bar.
- ✅ **Voice assist (turn / money / rate intents), district read-models, disruption + reschedule engine, offline operator sync, grievances tied to a lot ID.**
- ✅ **19 backend test files**; farmer PWA (8 screens) + admin console.
- 🔜 **Remaining for production:** a real MSG91 authkey + DLT-approved templates for physical SMS delivery, `DATA_GOV_API_KEY` from data.gov.in for live Agmarknet prices, and PFMS production credentials for DBT reconciliation.

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
- **Before leaving home:** live Agmarknet prices in Hindi/Punjabi — farmer chooses the best mandi instead of driving blind
- **2–5 days → under 90 min:** wait at the centre — no more sleeping beside the trolley
- **3.8× → 1.3×:** peak-to-average arrivals once slots spread the demand
- **Silent → tracked:** 5-stage produce journey visible on the phone; payment failure reason surfaced within 24 h
- **0 → 100%:** farmers who know their turn, their produce status, and their payment stage — before leaving home and after dropping off

**Impact of KisanQ (four dimensions):** Governance (real-time data for policy decisions), Social (reduced stress, greater trust), Economic (saved time, faster payments, no distress sales below MSP), Environmental (less fuel waste, less paper use)

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
