/**
 * Seeds a demo district: three real Ludhiana centres, ten days of capacity,
 * and the farmer from the original prototype so the demo opens on familiar
 * data instead of an empty database.
 *
 * Idempotent — safe to run repeatedly. Run `npm run db:seed -- --reset` to
 * truncate first.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, sql } from "./client.js";
import * as t from "./schema.js";
import { computeCapacity, planDay, trolleysFor, istDate, addDays } from "../domain/capacity.js";
import { hashSecret, numericCode } from "../lib/hash.js";
import { bookingRef, receiptNo } from "../lib/ids.js";

const DAYS_AHEAD = 10;
const reset = process.argv.includes("--reset");

const CENTRES = [
  { code: "jagraon",  name: "Jagraon Procurement Centre",   district: "Ludhiana", lat: "30.789800", lng: "75.473600", lanes: 3, weighbridgeQtlDay: 1800, gunnyBags: 4200, godownFreeQtl: 2400 },
  { code: "mullanpur", name: "Mullanpur Procurement Centre", district: "Ludhiana", lat: "30.936000", lng: "76.712000", lanes: 2, weighbridgeQtlDay: 1200, gunnyBags: 1900, godownFreeQtl: 1600 },
  { code: "raikot",   name: "Raikot Procurement Centre",    district: "Ludhiana", lat: "30.649000", lng: "75.606000", lanes: 2, weighbridgeQtlDay: 1500, gunnyBags: 3000, godownFreeQtl:  900 },
];

async function main() {
  if (reset) {
    console.log("truncating…");
    await sql`
      truncate table
        audit_log, idempotency_keys, refresh_tokens, otp_requests,
        centre_events, rates, pending_decisions, messages,
        payments, lots, service_events, tokens, bookings,
        slots, centre_days, centres, holdings, users
      restart identity cascade`;
  }

  /* ---------------------------------------------------------- centres */
  const centreIds: Record<string, string> = {};
  for (const c of CENTRES) {
    const existing = await db.select().from(t.centres).where(eq(t.centres.code, c.code)).limit(1);
    if (existing[0]) {
      centreIds[c.code] = existing[0].id;
      continue;
    }
    const [row] = await db.insert(t.centres).values({ ...c, qtlPerBag: "0.50" }).returning();
    centreIds[c.code] = row!.id;
  }
  console.log(`centres: ${Object.keys(centreIds).length}`);

  /* ------------------------------------------------- days + slots */
  const today = istDate();
  let dayCount = 0;
  let slotCount = 0;

  for (const c of CENTRES) {
    const { capacityQtl, bindingConstraint } = computeCapacity({
      weighbridgeQtlDay: c.weighbridgeQtlDay,
      gunnyBags: c.gunnyBags,
      qtlPerBag: 0.5,
      godownFreeQtl: c.godownFreeQtl,
    });
    console.log(`  ${c.code}: ${capacityQtl} qtl/day (limited by ${bindingConstraint})`);

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = addDays(today, i);
      const existing = await db
        .select()
        .from(t.centreDays)
        .where(eq(t.centreDays.date, date))
        .limit(200);
      if (existing.some((d) => d.centreId === centreIds[c.code])) continue;

      const [day] = await db
        .insert(t.centreDays)
        .values({
          centreId: centreIds[c.code]!,
          date,
          capacityQtl,
          capacityTrolleys: trolleysFor(capacityQtl),
        })
        .returning();
      dayCount++;

      const planned = planDay(date, capacityQtl);
      await db.insert(t.slots).values(
        planned.map((p) => ({
          centreDayId: day!.id,
          windowStart: p.windowStart,
          windowEnd: p.windowEnd,
          capacityTrolleys: p.capacityTrolleys,
          capacityQtl: p.capacityQtl,
        })),
      );
      slotCount += planned.length;
    }
  }
  console.log(`centre-days: ${dayCount}, slots: ${slotCount}`);

  /* ------------------------------------------------------------ users */
  const legacy = JSON.parse(readFileSync(new URL("../../seed/legacy-store.json", import.meta.url), "utf8"));
  const farmerName: string = legacy?.profile?.name ?? "Harpreet Singh";

  const people = [
    { mobile: "+919876543210", name: farmerName,      role: "farmer" as const,   language: "pa" as const, district: "Ludhiana" },
    { mobile: "+919812000001", name: "Gurdeep Kaur",  role: "farmer" as const,   language: "pa" as const, district: "Ludhiana" },
    { mobile: "+919812000002", name: "Ramesh Yadav",  role: "farmer" as const,   language: "hi" as const, district: "Ludhiana" },
    { mobile: "+919815500001", name: "Jagraon Operator", role: "operator" as const, language: "pa" as const, district: "Ludhiana", centreId: centreIds["jagraon"] },
    { mobile: "+919815500009", name: "Ludhiana DFSC",   role: "district" as const, language: "en" as const, district: "Ludhiana" },
  ];

  const userIds: Record<string, string> = {};
  for (const p of people) {
    const existing = await db.select().from(t.users).where(eq(t.users.mobile, p.mobile)).limit(1);
    if (existing[0]) { userIds[p.mobile] = existing[0].id; continue; }
    const [row] = await db.insert(t.users).values(p).returning();
    userIds[p.mobile] = row!.id;
  }
  console.log(`users: ${Object.keys(userIds).length}`);

  /* --------------------------------------------------------- holdings */
  const holdingRows = [
    { mobile: "+919876543210", village: "Kaunke Kalan", areaHa: "3.20", entitlementQtl: "128.00", lat: "30.7460", lng: "75.5100" },
    { mobile: "+919812000001", village: "Sidhwan Bet",  areaHa: "1.60", entitlementQtl: "64.00",  lat: "30.8300", lng: "75.5700" }, // ≤2 ha → small-holder pool
    { mobile: "+919812000002", village: "Hathur",       areaHa: "5.00", entitlementQtl: "200.00", lat: "30.6800", lng: "75.6300" },
  ];
  for (const h of holdingRows) {
    await db.insert(t.holdings).values({
      userId: userIds[h.mobile]!,
      village: h.village,
      district: "Ludhiana",
      areaHa: h.areaHa,
      crop: "Wheat",
      season: "Rabi 2026",
      entitlementQtl: h.entitlementQtl,
      lat: h.lat,
      lng: h.lng,
    }).onConflictDoNothing();
  }

  /* ---------------------------------- the prototype's farmer, restored */
  const farmerId = userIds["+919876543210"]!;
  const hasBooking = await db.select().from(t.bookings).where(eq(t.bookings.userId, farmerId)).limit(1);

  if (!hasBooking[0]) {
    // Tomorrow's 10:00 window at Jagraon — matches the Sunrise home screen.
    const tomorrow = addDays(today, 1);
    const [day] = await db
      .select().from(t.centreDays)
      .where(eq(t.centreDays.date, tomorrow)).limit(50);
    const days = await db.select().from(t.centreDays).where(eq(t.centreDays.date, tomorrow));
    const jagraonDay = days.find((d) => d.centreId === centreIds["jagraon"]) ?? day;
    const daySlots = await db.select().from(t.slots).where(eq(t.slots.centreDayId, jagraonDay!.id));
    const slot = daySlots.sort((a, b) => +a.windowStart - +b.windowStart)[1] ?? daySlots[0];

    const gateOtp = numericCode(4);
    const [booking] = await db.insert(t.bookings).values({
      ref: bookingRef(),
      userId: farmerId,
      slotId: slot!.id,
      centreId: centreIds["jagraon"]!,
      date: tomorrow,
      crop: "Wheat",
      qtlDeclared: "23.00",
      trolleys: 1,
      pool: "general",
      gateOtpHash: hashSecret(gateOtp),
    }).returning();

    await db.update(t.slots).set({
      bookedTrolleys: slot!.bookedTrolleys + 1,
      bookedQtl: String(Number(slot!.bookedQtl) + 23),
    }).where(eq(t.slots.id, slot!.id));

    console.log(`booking ${booking!.ref} for ${farmerName}, gate OTP ${gateOtp} (dev only)`);

    /* ------- the two procurement records, as lots + payments ------- */
    const legacyLots: Array<{ variety: string; qtl: string; amount: string; status: "credited" | "initiated" }> =
      (legacy?.procurements ?? []).map((p: any) => ({
        variety: p.variety,
        qtl: String(p.quantityQuintals),
        amount: String(p.amount),
        status: p.paymentStatus === "credited" ? "credited" : "initiated",
      }));

    for (const [i, l] of legacyLots.entries()) {
      const pastDate = addDays(today, -(20 - i * 2));
      const [pastDay] = await db.insert(t.centreDays).values({
        centreId: centreIds["jagraon"]!,
        date: pastDate,
        capacityQtl: 900,
        capacityTrolleys: 36,
        status: "closed",
      }).onConflictDoNothing().returning();
      if (!pastDay) continue;

      const [pastSlot] = await db.insert(t.slots).values({
        centreDayId: pastDay.id,
        windowStart: new Date(`${pastDate}T08:00:00+05:30`),
        windowEnd: new Date(`${pastDate}T10:00:00+05:30`),
        capacityTrolleys: 8,
        capacityQtl: 200,
      }).returning();

      const [pastBooking] = await db.insert(t.bookings).values({
        ref: bookingRef(),
        userId: farmerId,
        slotId: pastSlot!.id,
        centreId: centreIds["jagraon"]!,
        date: pastDate,
        crop: "Wheat",
        qtlDeclared: l.qtl,
        status: "served",
        gateOtpHash: hashSecret(numericCode(4)),
      }).returning();

      const rate = (Number(l.amount) / Number(l.qtl)).toFixed(2);
      const [lot] = await db.insert(t.lots).values({
        receiptNo: receiptNo(),
        bookingId: pastBooking!.id,
        userId: farmerId,
        centreId: centreIds["jagraon"]!,
        crop: "Wheat",
        variety: l.variety,
        moisturePct: "11.20",
        normPct: "12.00",
        grossQtl: String(Number(l.qtl) + 0.4),
        tareQtl: "0.40",
        netQtl: l.qtl,
        ratePerQtl: rate,
        amount: l.amount,
      }).returning();

      await db.insert(t.payments).values({
        lotId: lot!.id,
        userId: farmerId,
        amount: l.amount,
        status: l.status,
        initiatedAt: new Date(`${pastDate}T12:00:00+05:30`),
        creditedAt: l.status === "credited" ? new Date(`${addDays(pastDate, 2)}T12:00:00+05:30`) : null,
        utr: l.status === "credited" ? `UTR${Date.now()}${i}` : null,
      });
    }

    /* --------------- notifications become message rows -------------- */
    for (const n of legacy?.notifications ?? []) {
      await db.insert(t.messages).values({
        userId: farmerId,
        channel: "in_app",
        templateId: "legacy_import",
        language: "en",
        category: "Booking",
        body: n.message,
        status: "delivered",
        sentAt: new Date(n.createdAt),
        deliveredAt: new Date(n.createdAt),
        readAt: n.read ? new Date(n.createdAt) : null,
      });
    }
  }

  const counts = await sql`
    select
      (select count(*) from users)       as users,
      (select count(*) from centres)     as centres,
      (select count(*) from centre_days) as centre_days,
      (select count(*) from slots)       as slots,
      (select count(*) from bookings)    as bookings,
      (select count(*) from lots)        as lots,
      (select count(*) from payments)    as payments,
      (select count(*) from messages)    as messages`;
  console.table(counts[0]);
}

await main();
await sql.end();
