/**
 * One runnable check for the admin mutation logic — no framework.
 *   npx tsx web/src/admin/data.selfcheck.ts   (from the repo root)
 *
 * Guards the non-trivial parts: capacity accounting on cancel/no-show, the
 * priority dock, serve-next ordering, and the payment flip.
 */
import assert from "node:assert/strict";
import { seed, mutate, overview } from "./data.js";

function admin(s = seed()) { s.admin = { name: "Test Admin", mobile: "+910000000000" }; return s; }

// cancel returns capacity to the centre-day and cannot touch a served booking
{
  const s = admin();
  const c = s.centres.find((x) => x.id === "jagraon")!;
  const before = { t: c.bookedTrolleys, q: c.bookedQtl };
  const b = s.bookings.find((x) => x.ref === "KS-26-77B1E2")!; // booked, jagraon
  mutate.cancelBooking(s, b.ref);
  assert.equal(b.status, "cancelled");
  assert.equal(c.bookedTrolleys, before.t - b.trolleys, "trolleys freed");
  assert.equal(c.bookedQtl, before.q - b.qtl, "quintals freed");
  assert.throws(() => mutate.cancelBooking(s, "KS-26-04DD31"), /served/, "served is protected");
}

// no-show docks priority by 8 and increments the count
{
  const s = admin();
  const f = s.farmers.find((x) => x.id === "u2")!;
  const p0 = f.priorityScore, n0 = f.noShowCount;
  mutate.markNoShow(s, "KS-26-77B1E2");
  assert.equal(f.priorityScore, p0 - 8);
  assert.equal(f.noShowCount, n0 + 1);
}

// serve-next takes the lowest unserved seq and advances nowServing
{
  const s = admin();
  const msg = mutate.serveNext(s, "jagraon");
  assert.match(msg, /023/, "token 23 is next after 22");
  assert.equal(s.nowServing.jagraon, 23);
  assert.equal(s.tokens.find((tk) => tk.seq === 23)!.served, true);
}

// retry credits a failed payment, clears the reason, stamps a UTR
{
  const s = admin();
  const p = s.payments.find((x) => x.receiptNo === "RCPT-260818-0441")!;
  assert.equal(p.status, "failed");
  mutate.retryPayment(s, p.receiptNo);
  assert.equal(p.status, "credited");
  assert.equal(p.failureReason, null);
  assert.ok(p.utr && p.utr.startsWith("SBIN0"));
}

// every mutation writes an audit row
{
  const s = admin();
  const n = s.audit.length;
  mutate.setDayStatus(s, "jagraon", "paused");
  assert.equal(s.audit.length, n + 1);
  assert.equal(s.audit[0].action, "centre_day.status");
}

// overview counts hold together
{
  const o = overview(admin());
  assert.equal(o.centres, 3);
  assert.equal(o.paymentsHeld, 1);
  assert.ok(o.procurementValue > 0);
}

console.log("admin data self-check: all assertions passed");
