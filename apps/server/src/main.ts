import { z } from "zod";
import { buildApp } from "./app.js";
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    APP_ORIGIN: z.url(),
    STORAGE_DIR: z.string().default(".data/files"),
    WEB_DIST: z.string().optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    TRUST_PROXY: z.string().optional(),
    HOST: z.string().default("127.0.0.1"),
  })
  .parse(process.env);
const app = await buildApp({
  databaseUrl: env.DATABASE_URL,
  allowedOrigin: env.APP_ORIGIN,
  storageDir: env.STORAGE_DIR,
  webDist: env.WEB_DIST,
  trustProxy: env.TRUST_PROXY,
  secureCookies: new URL(env.APP_ORIGIN).protocol === "https:",
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void app
      .close()
      .then(() => {
        process.exitCode = 0;
      })
      .catch(() => {
        process.exitCode = 1;
      });
  });
await app.listen({ host: env.HOST, port: env.PORT });
