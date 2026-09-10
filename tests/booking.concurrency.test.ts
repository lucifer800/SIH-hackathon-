/**
 * THE L2 GATE.
 *
 * Fire many simultaneous bookings at a slot with a handful of seats and prove
 * exactly the capacity succeeds — never one more. This is the single hardest
 * claim in the SIH submission ("server-authoritative, sole writer of bookings"),
 * and the only honest way to test it is against a real Postgres with real
 * concurrent connections contending on the centre-day lock.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, inArray, sql as raw } from "drizzle-orm";
import { db, sql } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { book } from "../src/modules/bookings/service.js";
import { AppError } from "../src/http/errors.js";
import { istDate } from "../src/domain/capacity.js";

const SEATS = 10;
const CONTENDERS = 50;
const CODE = "concurrency-test-centre";

let centreId: string;
let slotId: string;
let userIds: string[] = [];

async function freshSlot() {
  // A slot dated today → pools are released, so all SEATS are one general pool and
  // every contender is equally eligible. Clean, single-variable test of the lock.
  const today = istDate();
  const [day] = await db.insert(t.centreDays).values({
    centreId, date: today, capacityQtl: SEATS * 25, capacityTrolleys: SEATS,
    poolsReleasedAt: new Date(),
  }).returning();
  const [slot] = await db.insert(t.slots).values({
    centreDayId: day!.id,
    windowStart: new Date(`${today}T08:00:00+05:30`),
    windowEnd: new Date(`${today}T10:00:00+05:30`),
    capacityTrolleys: SEATS, capacityQtl: SEATS * 25,
  }).returning();
  return slot!.id;
}

beforeAll(async () => {
  const [centre] = await db.insert(t.centres).values({
    code: CODE, name: "Concurrency Test Centre", district: "TestLand",
    lat: "30.0", lng: "75.0", lanes: 2,
    weighbridgeQtlDay: 9999, gunnyBags: 99999, godownFreeQtl: 9999, qtlPerBag: "0.50",
  }).returning();
  centreId = centre!.id;

  for (let i = 0; i < CONTENDERS; i++) {
    const [u] = await db.insert(t.users).values({
      mobile: `+9199999${String(i).padStart(5, "0")}`, name: `Contender ${i}`, language: "en", role: "farmer",
    }).returning();
    await db.insert(t.holdings).values({
      userId: u!.id, village: "Test", district: "TestLand", areaHa: "5.00",
      crop: "Wheat", season: "Rabi 2026", entitlementQtl: "100.00",
    });
    userIds.push(u!.id);
  }
});

afterAll(async () => {
  if (userIds.length) {
    await db.delete(t.bookings).where(inArray(t.bookings.userId, userIds));
    await db.delete(t.holdings).where(inArray(t.holdings.userId, userIds));
    await db.delete(t.users).where(inArray(t.users.id, userIds));
  }
  if (centreId) {
    const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
    for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
    await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
    await db.delete(t.centres).where(eq(t.centres.id, centreId));
  }
  await sql.end();
});

beforeEach(async () => {
  // Reset entitlement usage and clear any slot/day from a prior run — the
  // (centre_id, date) index is unique, so each run starts from a clean day.
  await db.delete(t.bookings).where(inArray(t.bookings.userId, userIds));
  await db.update(t.holdings).set({ usedQtl: "0" }).where(inArray(t.holdings.userId, userIds));
  const days = await db.select({ id: t.centreDays.id }).from(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  for (const d of days) await db.delete(t.slots).where(eq(t.slots.centreDayId, d.id));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  slotId = await freshSlot();
});

describe(`${CONTENDERS} farmers, ${SEATS} seats`, () => {
  it("gives exactly the seats away and refuses the rest with SLOT_FULL", async () => {
    const attempts = userIds.map((userId) =>
      book({ userId, slotId, qtl: 10, trolleys: 1 })
        .then(() => ({ ok: true as const }))
        .catch((e: unknown) => ({ ok: false as const, error: e })),
    );
    const results = await Promise.all(attempts);

    const won = results.filter((r) => r.ok).length;
    const lost = results.filter((r) => !r.ok);

    expect(won).toBe(SEATS);
    expect(lost).toHaveLength(CONTENDERS - SEATS);

    // Every loss must be a clean, typed SLOT_FULL — not a deadlock or a 500.
    for (const l of lost) {
      expect(l.ok).toBe(false);
      if (!l.ok) {
        expect(l.error).toBeInstanceOf(AppError);
        expect((l.error as AppError).code).toBe("SLOT_FULL");
      }
    }
  });

  it("leaves the counters reconciled with the actual rows", async () => {
    await Promise.all(userIds.map((userId) => book({ userId, slotId, qtl: 10, trolleys: 1 }).catch(() => null)));

    const [slot] = await db.select().from(t.slots).where(eq(t.slots.id, slotId)).limit(1);
    const [agg] = await db
      .select({
        rows: raw<number>`count(*)::int`,
        trolleys: raw<number>`coalesce(sum(${t.bookings.trolleys}),0)::int`,
        qtl: raw<number>`coalesce(sum(${t.bookings.qtlDeclared}),0)::float`,
      })
      .from(t.bookings)
      .where(and(eq(t.bookings.slotId, slotId), inArray(t.bookings.status, ["booked", "checked_in", "served"])));

    expect(agg!.rows).toBe(SEATS);                       // never oversold
    expect(slot!.bookedTrolleys).toBe(agg!.trolleys);    // denormalised counter matches reality
    expect(slot!.bookedTrolleys).toBe(SEATS);
    expect(Number(slot!.bookedQtl)).toBe(agg!.qtl);
    expect(slot!.bookedTrolleys).toBeLessThanOrEqual(slot!.capacityTrolleys);
  });

  it("does not double-charge entitlement for the winners", async () => {
    await Promise.all(userIds.map((userId) => book({ userId, slotId, qtl: 10, trolleys: 1 }).catch(() => null)));
    const holdings = await db.select().from(t.holdings).where(inArray(t.holdings.userId, userIds));
    const used = holdings.filter((h) => Number(h.usedQtl) > 0);
    expect(used).toHaveLength(SEATS);               // exactly the winners spent entitlement
    expect(used.every((h) => Number(h.usedQtl) === 10)).toBe(true);
  });
});
