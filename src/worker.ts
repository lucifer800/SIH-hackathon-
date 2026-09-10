/**
 * Background worker — the scheduled side of KisanQ.
 *
 * Runs the jobs that must happen on a clock rather than on a request:
 *   • maintenance every 15 min — sweep no-shows, release expired holds, expire offers
 *   • rate ingest daily at 02:00 IST — refresh mandi prices
 *
 * These are the SAME functions the manual admin endpoints call, so the behaviour is
 * identical whether triggered by the schedule or by hand. A separate process on
 * Render (see render.yaml); locally, `npm run worker`.
 */
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env.js";
import { runMaintenance } from "./modules/maintenance/service.js";
import { ingestFromDataGov } from "./modules/rates/service.js";
import { sql } from "./db/client.js";

if (!env.REDIS_URL) {
  console.error("REDIS_URL is required to run the worker.");
  process.exit(1);
}

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }) as unknown as ConnectionOptions;
const QUEUE = "kisanq-jobs";

const queue = new Queue(QUEUE, { connection });

const worker = new Worker(
  QUEUE,
  async (job) => {
    switch (job.name) {
      case "maintenance": {
        const r = await runMaintenance();
        console.log(`[worker] maintenance: swept ${r.swept} no-shows, released ${r.released} holds, expired ${r.expired} offers`);
        return r;
      }
      case "rate-ingest": {
        const r = await ingestFromDataGov();
        console.log(`[worker] rate-ingest: ${r.inserted} rows (${r.source})`);
        return r;
      }
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  },
  { connection, concurrency: 2 },
);

worker.on("failed", (job, err) => console.error(`[worker] ${job?.name} failed:`, err.message));

async function scheduleRepeatables() {
  // Job schedulers are idempotent by id — re-running the worker re-declares them.
  await queue.upsertJobScheduler("maintenance-15m", { every: 15 * 60_000 }, { name: "maintenance", opts: { removeOnComplete: 100, removeOnFail: 100 } });
  await queue.upsertJobScheduler("rate-ingest-daily", { pattern: "0 2 * * *", tz: "Asia/Kolkata" }, { name: "rate-ingest", opts: { removeOnComplete: 20, removeOnFail: 20 } });
  console.log("[worker] repeatable jobs scheduled: maintenance/15m, rate-ingest @02:00 IST");
}

await scheduleRepeatables();
console.log("[worker] KisanQ worker running");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`[worker] ${signal} received, closing`);
    await worker.close();
    await queue.close();
    await connection.quit?.();
    await sql.end();
    process.exit(0);
  });
}
