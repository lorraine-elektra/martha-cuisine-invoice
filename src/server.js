import { openDb } from "./db.js";
import { createApp } from "./app.js";

const password = process.env.INVOICE_PASSWORD;
if (!password || password.length < 8) {
  console.error("Set INVOICE_PASSWORD (at least 8 characters) in a .env file. See .env.example.");
  process.exit(1);
}

const db = openDb(process.env.DB_FILE ?? "invoices.db");
const app = createApp({
  db,
  password,
  secret: process.env.SESSION_SECRET,
  trustProxy: process.env.TRUST_PROXY === "1",
});
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Open http://localhost:${port}`));
