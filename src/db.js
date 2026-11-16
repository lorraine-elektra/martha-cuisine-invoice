import { DatabaseSync } from "node:sqlite";

// Version 2 stores the items as typed in (lines), plus how the discount and tax were entered.
// Invoices saved by version 1 (fixed packages) are kept and still open: see legacyLines().
const OLD_RATES = { bronze: ["Bronze", 8000], silver: ["Silver", 10000], gold: ["Gold", 12000] };

export function openDb(file = "invoices.db") {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'unpaid',
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      invoice_date TEXT NOT NULL DEFAULT '',
      package_id TEXT NOT NULL DEFAULT '',
      guests INTEGER NOT NULL DEFAULT 0,
      extras TEXT NOT NULL DEFAULT '[]',
      dishes TEXT NOT NULL DEFAULT '[]',
      discount INTEGER NOT NULL DEFAULT 0,
      deposit INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );
  `);
  const have = new Set(db.prepare("PRAGMA table_info(invoices)").all().map((c) => c.name));
  const add = (name, ddl) => { if (!have.has(name)) db.exec(`ALTER TABLE invoices ADD COLUMN ${name} ${ddl}`); };
  add("lines", "TEXT NOT NULL DEFAULT '[]'");
  add("discount_type", "TEXT NOT NULL DEFAULT 'amount'");
  add("discount_value", "INTEGER NOT NULL DEFAULT 0");
  add("tax_bp", "INTEGER NOT NULL DEFAULT 0");
  add("tax_amount", "INTEGER NOT NULL DEFAULT 0");
  add("subtotal", "INTEGER NOT NULL DEFAULT 0");
  return db;
}

// Rebuilds the items of an invoice saved before manual entry existed.
function legacyLines(r) {
  const [name, rate] = OLD_RATES[r.package_id] ?? [r.package_id || "Catering", 0];
  const lines = [{ description: `${name} package`, quantity: r.guests, unitPrice: rate }];
  lines.push({ description: "Set-up charge", quantity: 1, unitPrice: 50000 });
  for (const e of JSON.parse(r.extras)) lines.push({ description: e.name, quantity: 1, unitPrice: e.amount });
  return lines;
}

const toInvoice = (r) => {
  if (!r) return r;
  let lines = JSON.parse(r.lines);
  let discountType = r.discount_type, discountValue = r.discount_value;
  if (!lines.length) { // saved by version 1
    lines = legacyLines(r);
    discountType = "amount";
    discountValue = r.discount;
  }
  return {
    id: r.id, number: r.number, status: r.status,
    clientName: r.client_name, clientPhone: r.client_phone,
    eventDate: r.event_date, venue: r.venue, invoiceDate: r.invoice_date,
    lines, dishes: JSON.parse(r.dishes),
    discountType, discountValue, taxBp: r.tax_bp,
    subtotal: lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0),
    discount: r.discount, tax: r.tax_amount, deposit: r.deposit,
    total: r.total, balance: r.balance,
    notes: r.notes, createdAt: r.created_at, paidAt: r.paid_at,
  };
};

// Columns written on save. The old package_id and guests columns are kept only for old rows.
const SAVE_COLUMNS = `client_name=?, client_phone=?, event_date=?, venue=?, invoice_date=?,
  lines=?, dishes=?, discount_type=?, discount_value=?, tax_bp=?,
  subtotal=?, discount=?, tax_amount=?, deposit=?, total=?, balance=?, notes=?`;

const saveParams = (v, t) => [
  v.clientName, v.clientPhone, v.eventDate, v.venue, v.invoiceDate,
  JSON.stringify(v.lines), JSON.stringify(v.dishes), v.discountType, v.discountValue, v.taxBp,
  t.subtotal, t.discount, t.tax, v.deposit, t.total, t.balance, v.notes,
];

export function createInvoice(db, v, t) {
  db.exec("BEGIN IMMEDIATE"); // lock so two saves can never get the same number
  try {
    const last = db.prepare("SELECT MAX(id) AS n FROM invoices").get().n ?? 0;
    const number = "MC-" + String(last + 1).padStart(4, "0");
    const info = db.prepare("INSERT INTO invoices (number, client_name, package_id, guests, total, balance) VALUES (?, '', '', 0, 0, 0)").run(number);
    const id = Number(info.lastInsertRowid);
    db.prepare(`UPDATE invoices SET ${SAVE_COLUMNS} WHERE id=?`).run(...saveParams(v, t), id);
    db.exec("COMMIT");
    return getInvoice(db, id);
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function updateInvoice(db, id, v, t) {
  const info = db.prepare(`UPDATE invoices SET ${SAVE_COLUMNS} WHERE id=?`).run(...saveParams(v, t), id);
  return info.changes ? getInvoice(db, id) : null;
}

export function getInvoice(db, id) {
  return toInvoice(db.prepare("SELECT * FROM invoices WHERE id = ?").get(id));
}

export function listInvoices(db, q = "") {
  const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  return db.prepare(`
    SELECT * FROM invoices
    WHERE number LIKE ? ESCAPE '\\' OR client_name LIKE ? ESCAPE '\\'
    ORDER BY id DESC LIMIT 200`).all(like, like).map(toInvoice);
}

export function setPaid(db, id, paid) {
  const info = db.prepare("UPDATE invoices SET status=?, paid_at=? WHERE id=?")
    .run(paid ? "paid" : "unpaid", paid ? new Date().toISOString() : null, id);
  return info.changes ? getInvoice(db, id) : null;
}
