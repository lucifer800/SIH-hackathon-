/**
 * The one place the app talks to a backend.
 *
 *   VITE_API_URL set  → the live /api/v1 backend (auth + booking wired; the rest
 *                       still falls back to the mock inside real.ts)
 *   unset             → mock only (standalone dev + offline demo)
 */
import { mock } from "./mock";
import { real } from "./real";
export * from "./types";

const USE_REAL = Boolean(import.meta.env.VITE_API_URL);

export const api = USE_REAL ? real : mock;
export const USING_MOCK = !USE_REAL;
