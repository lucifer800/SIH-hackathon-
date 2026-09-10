import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    // Integration tests share one Postgres; run files serially so they do not
    // contend for connections or collide on fixture rows. In-test concurrency
    // (the 50-booking race) is unaffected.
    fileParallelism: false,
  },
});
