import { buildApp } from "./app.js";
import { env } from "./env.js";
import { sql } from "./db/client.js";

const app = await buildApp();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, closing`);
    await app.close();
    await sql.end();
    process.exit(0);
  });
}

await app.listen({ port: env.PORT, host: env.HOST });
