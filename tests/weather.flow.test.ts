/**
 * Weather-triggered reschedule: the same declareEvent() an operator's manual
 * entry calls, fired automatically the moment live rain crosses the threshold
 * at an open centre — no waiting for a human to notice the sky. Fetch is
 * mocked (Open-Meteo is a real, keyless API; a flaky network shouldn't flake
 * this suite) so the gate is the threshold + once-per-day logic, not the
 * weather itself.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import * as t from "../src/db/schema.js";
import { checkWeatherDisruptions } from "../src/modules/weather/service.js";
import { istDate } from "../src/domain/capacity.js";

const CODE = "weather-flow-centre";
let centreId = "";
const today = istDate();

function mockRain(mm: number) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ current: { precipitation: mm, rain: mm } }),
  })));
}

beforeAll(async () => {
  await db.delete(t.centres).where(eq(t.centres.code, CODE));
  const [c] = await db.insert(t.centres).values({
    code: CODE, name: "Weather Flow Centre", district: "WeatherLand",
    lat: "30.9", lng: "75.8", lanes: 1, weighbridgeQtlDay: 9999, gunnyBags: 99999, godownFreeQtl: 9999, qtlPerBag: "0.50",
  }).returning();
  centreId = c!.id;
});

beforeEach(async () => {
  await db.delete(t.centreEvents).where(and(eq(t.centreEvents.centreId, centreId), eq(t.centreEvents.date, today)));
  await db.insert(t.centreDays).values({ centreId, date: today, capacityQtl: 500, capacityTrolleys: 20, poolsReleasedAt: new Date(), status: "open" })
    .onConflictDoUpdate({ target: [t.centreDays.centreId, t.centreDays.date], set: { status: "open" } });
});

afterAll(async () => {
  await db.delete(t.centreEvents).where(eq(t.centreEvents.centreId, centreId));
  await db.delete(t.centreDays).where(eq(t.centreDays.centreId, centreId));
  await db.delete(t.centres).where(eq(t.centres.id, centreId));
  vi.unstubAllGlobals();
});

describe("weather-triggered reschedule", () => {
  it("does nothing below the rain threshold", async () => {
    mockRain(0.5); // below the 2mm/h threshold
    const r = await checkWeatherDisruptions();
    expect(r.triggered).toBe(0);

    const [event] = await db.select().from(t.centreEvents).where(and(eq(t.centreEvents.centreId, centreId), eq(t.centreEvents.date, today)));
    expect(event).toBeUndefined();
  });

  it("auto-declares a rain event through the same path as a manual operator entry", async () => {
    mockRain(5); // well above threshold
    const r = await checkWeatherDisruptions();
    expect(r.triggered).toBeGreaterThanOrEqual(1);

    const [event] = await db.select().from(t.centreEvents).where(and(eq(t.centreEvents.centreId, centreId), eq(t.centreEvents.date, today)));
    expect(event).toBeDefined();
    expect(event!.kind).toBe("rain");
    expect(event!.createdBy).toBeNull(); // system-triggered, not a human operator

    const [day] = await db.select().from(t.centreDays).where(and(eq(t.centreDays.centreId, centreId), eq(t.centreDays.date, today)));
    expect(day!.status).toBe("paused"); // declareEvent's own effect — proves it's the real path
  });

  it("does not trigger a second time the same day, even if still raining", async () => {
    mockRain(5);
    await checkWeatherDisruptions();
    const afterFirst = await db.select().from(t.centreEvents).where(and(eq(t.centreEvents.centreId, centreId), eq(t.centreEvents.date, today)));

    const second = await checkWeatherDisruptions();
    expect(second.triggered).toBe(0);

    const afterSecond = await db.select().from(t.centreEvents).where(and(eq(t.centreEvents.centreId, centreId), eq(t.centreEvents.date, today)));
    expect(afterSecond.length).toBe(afterFirst.length);
  });

  it("skips a centre whose day is not open (already paused or closed)", async () => {
    await db.update(t.centreDays).set({ status: "closed" }).where(and(eq(t.centreDays.centreId, centreId), eq(t.centreDays.date, today)));
    mockRain(10);
    const r = await checkWeatherDisruptions();
    expect(r.checked).toBe(0);
    expect(r.triggered).toBe(0);
  });
});
