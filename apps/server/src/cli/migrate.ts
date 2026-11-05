import { migrate } from "../db/migrate.js";
const url = process.env.DATABASE_OWNER_URL,
  password = process.env.APP_DATABASE_PASSWORD;
if (!url || !password)
  throw new Error(
    "Set DATABASE_OWNER_URL and APP_DATABASE_PASSWORD for migrations.",
  );
await migrate(url, password);
process.stdout.write("Database migrations applied.\n");
