import { DatabaseSync } from "node:sqlite";

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
      package_id TEXT NOT NULL,
      guests INTEGER NOT NULL,
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
  return db;
}

const toInvoice = (r) => r && {
  id: r.id, number: r.number, status: r.status,
  clientName: r.client_name, clientPhone: r.client_phone,
  eventDate: r.event_date, venue: r.venue, invoiceDate: r.invoice_date,
  packageId: r.package_id, guests: r.guests,
  extras: JSON.parse(r.extras), dishes: JSON.parse(r.dishes),
  discount: r.discount, deposit: r.deposit, total: r.total, balance: r.balance,
  notes: r.notes, createdAt: r.created_at, paidAt: r.paid_at,
};

export function createInvoice(db, v, t) {
  db.exec("BEGIN IMMEDIATE"); // lock so two saves can never get the same number
  try {
    const last = db.prepare("SELECT MAX(id) AS n FROM invoices").get().n ?? 0;
    const number = "MC-" + String(last + 1).padStart(4, "0");
    const info = db.prepare(`
      INSERT INTO invoices (number, client_name, client_phone, event_date, venue, invoice_date,
        package_id, guests, extras, dishes, discount, deposit, total, balance, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(number, v.clientName, v.clientPhone, v.eventDate, v.venue, v.invoiceDate,
        v.packageId, v.guests, JSON.stringify(v.extras), JSON.stringify(v.dishes),
        v.discount, v.deposit, t.total, t.balance, v.notes);
    db.exec("COMMIT");
    return getInvoice(db, Number(info.lastInsertRowid));
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function updateInvoice(db, id, v, t) {
  const info = db.prepare(`
    UPDATE invoices SET client_name=?, client_phone=?, event_date=?, venue=?, invoice_date=?,
      package_id=?, guests=?, extras=?, dishes=?, discount=?, deposit=?, total=?, balance=?, notes=?
    WHERE id=?`)
    .run(v.clientName, v.clientPhone, v.eventDate, v.venue, v.invoiceDate,
      v.packageId, v.guests, JSON.stringify(v.extras), JSON.stringify(v.dishes),
      v.discount, v.deposit, t.total, t.balance, v.notes, id);
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
