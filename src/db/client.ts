import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

/** One pool for the app. Tests keep several connections so the L2 concurrency gate
 *  actually contends on the centre-day lock instead of serialising at the pool. */
export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  onnotice: () => {},
});

export const db = drizzle(sql, { schema, casing: "snake_case" });
export type Db = typeof db;
export { schema };
