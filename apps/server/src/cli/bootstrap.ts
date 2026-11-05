import { bootstrap } from "../auth/bootstrap.service.js";
const url = process.env.DATABASE_OWNER_URL,
  email = process.env.ADMIN_EMAIL,
  name = process.env.ADMIN_NAME ?? "Administrator";
if (!url || !email)
  throw new Error(
    "Set DATABASE_OWNER_URL and ADMIN_EMAIL. Pipe a password on stdin.",
  );
let password = process.env.ADMIN_PASSWORD ?? "";
if (!password) {
  for await (const chunk of process.stdin) {
    password += chunk.toString();
    if (password.length > 202) throw new Error("Password input is too long.");
  }
  password = password.replace(/\r?\n$/, "");
}
await bootstrap(url, { email, name, password });
process.stdout.write(
  "Administrator created. Sign in with the email and password supplied.\n",
);
