/**
 * The one place the app talks to a backend. Today it delegates to the mock data
 * layer; when the farmer endpoints land (L1–L4) each method here becomes a real
 * fetch to /api/v1 with the same return shape, and no screen changes.
 *
 *   VITE_API_URL set  → try the real API, fall back to mock on network failure
 *   unset             → mock only (the default for standalone dev + the demo)
 */
import { mock } from "./mock";
export * from "./types";

export const api = mock;

export const USING_MOCK = true;
