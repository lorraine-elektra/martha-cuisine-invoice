// Makes a safe copy of the database: npm run backup
// Safe even while the app is running, unlike copying the file by hand.
import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const source = process.env.DB_FILE ?? "invoices.db";
const dir = process.env.BACKUP_DIR ?? "backups";
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const target = path.join(dir, `invoices-${stamp}.db`);

const db = new DatabaseSync(source, { readOnly: true });
await backup(db, target);
db.close();
console.log("Backup saved to " + target);
