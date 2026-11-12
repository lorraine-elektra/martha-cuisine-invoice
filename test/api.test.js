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

const sample = (over = {}) => ({
  clientName: "Ama Mensah", clientPhone: "0240000000", eventDate: "2026-12-20", venue: "Madina",
  invoiceDate: "2026-11-12", packageId: "gold", guests: 180, extras: [], dishes: ["Jollof rice"],
  discount: 0, deposit: 0, notes: "", ...over,
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
  for (const bad of [sample({ guests: 1.5 }), sample({ packageId: "platinum" }), sample({ clientName: "" }),
    sample({ deposit: -5 }), sample({ extras: [{ name: "x", amount: "10" }] })]) {
    const res = await call("POST", "/api/invoices", bad);
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error);
  }
});

test("update recalculates, search finds it, mark paid works", async () => {
  const created = await (await call("POST", "/api/invoices", sample({ clientName: "Searchable Person" }))).json();
  const updated = await (await call("PUT", `/api/invoices/${created.id}`, sample({ clientName: "Searchable Person", guests: 200 }))).json();
  assert.equal(updated.total, 2450000);
  const found = await (await call("GET", "/api/invoices?q=Searchable")).json();
  assert.equal(found.length, 1);
  const paid = await (await call("POST", `/api/invoices/${created.id}/paid`, { paid: true })).json();
  assert.equal(paid.status, "paid");
});

test("unknown invoice is a 404 and server files stay private", async () => {
  assert.equal((await call("GET", "/api/invoices/9999")).status, 404);
  assert.equal((await call("GET", "/src/db.js")).status, 404);
  assert.equal((await call("GET", "/src/totals.js")).status, 200);
});
