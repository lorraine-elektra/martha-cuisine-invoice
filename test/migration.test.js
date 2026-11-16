import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb, getInvoice, createInvoice } from "../src/db.js";

// A database file made by the first version of the app (fixed packages).
function makeOldDb(file) {
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'unpaid',
      client_name TEXT NOT NULL, client_phone TEXT NOT NULL DEFAULT '', event_date TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '', invoice_date TEXT NOT NULL DEFAULT '', package_id TEXT NOT NULL,
      guests INTEGER NOT NULL, extras TEXT NOT NULL DEFAULT '[]', dishes TEXT NOT NULL DEFAULT '[]',
      discount INTEGER NOT NULL DEFAULT 0, deposit INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
      balance INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), paid_at TEXT
    );
    INSERT INTO invoices (number, client_name, package_id, guests, extras, total, balance)
    VALUES ('MC-0001', 'Old Client', 'gold', 180, '[{"name":"Fish balls","amount":30000}]', 2240000, 2240000);
  `);
  old.close();
}

test("invoices from the fixed-package version still open, and new ones can be saved beside them", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mc-"));
  try {
    const file = path.join(dir, "old.db");
    makeOldDb(file);
    const db = openDb(file);

    const old = getInvoice(db, 1);
    assert.deepEqual(old.lines.map((l) => [l.description, l.quantity, l.unitPrice]), [
      ["Gold package", 180, 12000], ["Set-up charge", 1, 50000], ["Fish balls", 1, 30000],
    ]);
    assert.equal(old.total, 2240000);

    const fresh = createInvoice(db,
      { clientName: "New", clientPhone: "", eventDate: "", venue: "", invoiceDate: "", notes: "", dishes: [],
        lines: [{ description: "X", quantity: 2, unitPrice: 500 }], discountType: "amount", discountValue: 0, taxBp: 0, deposit: 0 },
      { subtotal: 1000, discount: 0, tax: 0, total: 1000, balance: 1000 });
    assert.equal(fresh.number, "MC-0002");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
