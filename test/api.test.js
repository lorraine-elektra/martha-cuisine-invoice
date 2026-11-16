import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";

let server, base, cookie;

const call = (method, url, body, withCookie = true) =>
  fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(withCookie && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const GOLD = { description: "Gold package", quantity: 180, unitPrice: 12000 };
const SETUP = { description: "Set-up charge", quantity: 1, unitPrice: 50000 };

const sample = (over = {}) => ({
  clientName: "Ama Mensah", clientPhone: "0240000000", eventDate: "2026-12-20", venue: "Madina",
  invoiceDate: "2026-11-12", lines: [GOLD, SETUP], dishes: ["Jollof rice"],
  discountType: "amount", discountValue: 0, taxBp: 0, deposit: 0, notes: "", ...over,
});

before(async () => {
  const app = createApp({ db: openDb(":memory:"), password: "test-password-123" });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
  const res = await call("POST", "/api/login", { password: "test-password-123" }, false);
  cookie = res.headers.get("set-cookie").split(";")[0];
});
after(() => server.close());

test("API refuses requests without a login", async () => {
  const res = await call("GET", "/api/invoices", undefined, false);
  assert.equal(res.status, 401);
});

test("wrong password is rejected", async () => {
  const res = await call("POST", "/api/login", { password: "nope" }, false);
  assert.equal(res.status, 401);
});

test("creating an invoice assigns MC-0001, then MC-0002", async () => {
  const a = await (await call("POST", "/api/invoices", sample())).json();
  const b = await (await call("POST", "/api/invoices", sample({ clientName: "Kofi" }))).json();
  assert.equal(a.number, "MC-0001");
  assert.equal(b.number, "MC-0002");
});

test("server works out the total itself and ignores one sent by the browser", async () => {
  const res = await call("POST", "/api/invoices", { ...sample(), total: 1, balance: 1 });
  const inv = await res.json();
  assert.equal(inv.total, 2210000);
  assert.equal(inv.balance, 2210000);
});

test("bad input is rejected with a clear message", async () => {
  for (const bad of [
    sample({ lines: [] }),
    sample({ lines: [{ ...GOLD, quantity: 1.5 }] }),
    sample({ lines: [{ ...GOLD, quantity: 0 }] }),
    sample({ lines: [{ ...GOLD, description: "" }] }),
    sample({ lines: [{ ...GOLD, unitPrice: "120" }] }),
    sample({ clientName: "" }),
    sample({ deposit: -5 }),
    sample({ taxBp: 20000 }),
    sample({ discountType: "percent", discountValue: 20000 }),
  ]) {
    const res = await call("POST", "/api/invoices", bad);
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error);
  }
});

test("update recalculates, search finds it, mark paid works", async () => {
  const created = await (await call("POST", "/api/invoices", sample({ clientName: "Searchable Person" }))).json();
  const updated = await (await call("PUT", `/api/invoices/${created.id}`,
    sample({ clientName: "Searchable Person", lines: [{ ...GOLD, quantity: 200 }, SETUP] }))).json();
  assert.equal(updated.total, 2450000);
  const found = await (await call("GET", "/api/invoices?q=Searchable")).json();
  assert.equal(found.length, 1);
  const paid = await (await call("POST", `/api/invoices/${created.id}/paid`, { paid: true })).json();
  assert.equal(paid.status, "paid");
});

test("percent discount and tax are worked out by the server and stored", async () => {
  const res = await call("POST", "/api/invoices", sample({
    lines: [{ description: "Item", quantity: 1, unitPrice: 100000 }],
    discountType: "percent", discountValue: 1000, taxBp: 1250,
  }));
  const inv = await res.json();
  assert.equal(inv.discount, 10000);
  assert.equal(inv.tax, 11250);
  assert.equal(inv.total, 101250);
  assert.equal(inv.discountType, "percent");
  assert.equal(inv.lines[0].description, "Item");
});

test("unknown invoice is a 404 and server files stay private", async () => {
  assert.equal((await call("GET", "/api/invoices/9999")).status, 404);
  assert.equal((await call("GET", "/src/db.js")).status, 404);
  assert.equal((await call("GET", "/src/totals.js")).status, 200);
});
