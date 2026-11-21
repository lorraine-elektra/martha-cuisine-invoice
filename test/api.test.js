import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb, createInvoice, updateInvoice, getInvoice, markPaid, addPaymentMethod } from "../src/db.js";
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
  discountType: "amount", discountValue: 0, deposit: 0, notes: "", ...over,
});

before(async () => {
  const app = createApp({ db: openDb(":memory:"), pin: "246810" });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
  const res = await call("POST", "/api/login", { pin: "246810" }, false);
  cookie = res.headers.get("set-cookie").split(";")[0];
});
after(() => server.close());

test("API refuses requests without a login", async () => {
  const res = await call("GET", "/api/invoices", undefined, false);
  assert.equal(res.status, 401);
});

test("wrong PIN is rejected", async () => {
  const res = await call("POST", "/api/login", { pin: "000000" }, false);
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
  const noMethod = await call("POST", `/api/invoices/${created.id}/paid`, { paid: true, pin: "246810" });
  assert.equal(noMethod.status, 400);
  const paid = await (await call("POST", `/api/invoices/${created.id}/paid`, { paid: true, pin: "246810", method: "momo" })).json();
  assert.equal(paid.status, "paid");
  assert.equal(paid.paymentMethod, "momo");
  const listed = await (await call("GET", "/api/invoices?q=Searchable")).json();
  assert.equal(listed[0].paymentMethod, "momo");
});

test("a paid invoice is locked: no edits, no un-paying, no change of payment method", async () => {
  const url = `/api/invoices/${(await (await call("POST", "/api/invoices", sample({ clientName: "Locked Person" }))).json()).id}`;
  const paid = await (await call("POST", url + "/paid", { paid: true, pin: "246810", method: "momo" })).json();

  const tries = [
    ["PUT", url, sample({ clientName: "Someone Else", lines: [{ ...GOLD, quantity: 1 }] })],
    ["PUT", url, { status: "unpaid" }], // not even invalid input gets a different answer
    ["POST", url + "/paid", { paid: false, pin: "246810" }],
    ["POST", url + "/paid", { paid: true, pin: "246810", method: "cash" }],
  ];
  for (const [method, to, body] of tries) {
    const res = await call(method, to, body);
    assert.equal(res.status, 409, `${method} ${to} ${JSON.stringify(body)}`);
    assert.ok((await res.json()).error);
  }
  assert.equal((await call("DELETE", url)).status, 404);
  assert.deepEqual(await (await call("GET", url)).json(), paid);
});

test("a new invoice cannot be created already paid, and an unpaid one has nothing to un-pay", async () => {
  const res = await call("POST", "/api/invoices", { ...sample(), status: "paid", paymentMethod: "cash", paidAt: "2020-01-01", number: "MC-9999", id: 1 });
  const inv = await res.json();
  assert.equal(inv.status, "unpaid");
  assert.equal(inv.paymentMethod, "");
  assert.equal(inv.paidAt, null);
  assert.notEqual(inv.number, "MC-9999");
  assert.notEqual(inv.id, 1);
  assert.equal((await call("POST", `/api/invoices/${inv.id}/paid`, { paid: false, pin: "246810" })).status, 409);
});

test("the database itself refuses to change or delete a paid invoice", () => {
  const db = openDb(":memory:");
  const values = { ...sample(), lines: [GOLD] };
  const totals = { subtotal: 2160000, discount: 0, total: 2160000, balance: 2160000 };
  const inv = createInvoice(db, values, totals);
  assert.ok(markPaid(db, inv.id, "bank"));
  assert.equal(markPaid(db, inv.id, "cash"), null);
  assert.equal(updateInvoice(db, inv.id, { ...values, clientName: "Changed" }, totals), null);
  assert.equal(addPaymentMethod(db, inv.id, "cash"), null);
  for (const sql of [
    "UPDATE invoices SET total = 1, balance = 0",
    "UPDATE invoices SET status = 'unpaid'",
    "UPDATE invoices SET payment_method = 'cash'",
    "UPDATE invoices SET payment_method = ''",
    "UPDATE invoices SET client_name = 'x', lines = '[]'",
    "DELETE FROM invoices",
  ]) assert.throws(() => db.exec(sql), /paid invoice/, sql);
  assert.equal(getInvoice(db, inv.id).clientName, "Ama Mensah");
  assert.equal(getInvoice(db, inv.id).paymentMethod, "bank");

  // An old invoice paid before methods were recorded can have its method filled in, once.
  const old = createInvoice(db, values, totals);
  db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(old.id);
  assert.throws(() => db.exec(`UPDATE invoices SET payment_method = 'cheque' WHERE id = ${old.id}`), /paid invoice/);
  assert.equal(addPaymentMethod(db, old.id, "cash").paymentMethod, "cash");
  assert.equal(addPaymentMethod(db, old.id, "momo"), null);
  db.close();
});

test("percent discount is worked out by the server and stored", async () => {
  const res = await call("POST", "/api/invoices", sample({
    lines: [{ description: "Item", quantity: 1, unitPrice: 100000 }],
    discountType: "percent", discountValue: 1000,
  }));
  const inv = await res.json();
  assert.equal(inv.discount, 10000);
  assert.equal(inv.total, 90000);
  assert.equal(inv.discountType, "percent");
  assert.equal(inv.lines[0].description, "Item");
});

test("unknown invoice is a 404 and server files stay private", async () => {
  assert.equal((await call("GET", "/api/invoices/9999")).status, 404);
  assert.equal((await call("GET", "/src/db.js")).status, 404);
  assert.equal((await call("GET", "/src/totals.js")).status, 200);
});

test("an invoice whose total passes GHS 100 million is refused instead of losing pesewas", async () => {
  const huge = { description: "Too big", quantity: 1_000_000, unitPrice: 100_000_000_00 };
  const res = await call("POST", "/api/invoices", sample({ lines: [huge] }));
  assert.equal(res.status, 400);
  const ok = await call("POST", "/api/invoices", sample({ lines: [{ description: "Big but fine", quantity: 1000, unitPrice: 100_000_00 }] }));
  assert.equal(ok.status, 201);
});

test("marking paid needs the right PIN, and repeated wrong PINs lock it for a while", async () => {
  const inv = await (await call("POST", "/api/invoices", sample())).json();
  const url = `/api/invoices/${inv.id}/paid`;
  for (const body of [{ method: "cash" }, { method: "cash", pin: "" }, { method: "cash", pin: 246810 }, { method: "cash", pin: "000000" }]) {
    const res = await call("POST", url, body);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).pinRequired, true);
  }
  assert.equal((await (await call("GET", `/api/invoices/${inv.id}`)).json()).status, "unpaid");
  assert.equal((await call("POST", url, { method: "cash", pin: "246810" })).status, 200);
});

test("five wrong PINs lock PIN checks, even for the right PIN", async () => {
  const app = createApp({ db: openDb(":memory:"), pin: "246810" });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  try {
    const b = `http://localhost:${s.address().port}`;
    const login = await fetch(b + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "246810" }) });
    const headers = { "Content-Type": "application/json", Cookie: login.headers.get("set-cookie").split(";")[0] };
    const post = (path, body) => fetch(b + path, { method: "POST", headers, body: JSON.stringify(body) });
    const inv = await (await post("/api/invoices", sample())).json();
    for (let i = 0; i < 5; i++) assert.equal((await post(`/api/invoices/${inv.id}/paid`, { method: "cash", pin: "111111" })).status, 403);
    assert.equal((await post(`/api/invoices/${inv.id}/paid`, { method: "cash", pin: "246810" })).status, 429);
  } finally { s.close(); }
});

test("login needs the right PIN, and the cookie is a session cookie", async () => {
  for (const body of [{ pin: "111111" }, {}, { pin: 246810 }]) {
    const res = await call("POST", "/api/login", body, false);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal((await res.json()).error, "Wrong PIN");
  }
  const ok = await call("POST", "/api/login", { pin: "246810" }, false);
  assert.equal(ok.status, 200);
  assert.doesNotMatch(ok.headers.get("set-cookie"), /max-age|expires=/i);
  // Using the site renews the session; a cookie past its idle time is refused.
  const mine = ok.headers.get("set-cookie").split(";")[0];
  const used = await fetch(base + "/api/session", { headers: { Cookie: mine } });
  assert.equal(used.status, 200);
  assert.match(used.headers.get("set-cookie"), /^mc_login=/);
  const [, started] = mine.split("=")[1].split(".");
  const stale = `mc_login=${Date.now() - 1000}.${started}.badsignature`;
  assert.equal((await fetch(base + "/api/session", { headers: { Cookie: stale } })).status, 401);
});
