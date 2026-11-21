import { openDb } from "./db.js";
import { createApp } from "./app.js";

const pin = process.env.INVOICE_PIN;
if (!pin || !/^\d{4,8}$/.test(pin)) {
  console.error("Set INVOICE_PIN (4 to 8 digits, 6 is best) in a .env file. See .env.example.");
  process.exit(1);
}

const db = openDb(process.env.DB_FILE ?? "invoices.db");
const app = createApp({
  db,
  pin,
  secret: process.env.SESSION_SECRET,
  trustProxy: process.env.TRUST_PROXY === "1",
});
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Open http://localhost:${port}`));
