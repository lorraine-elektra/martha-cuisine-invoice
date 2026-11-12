import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTotals } from "../src/totals.js";
import { cedisToPesewas, formatGHS } from "../src/money.js";

test("Gold, 180 guests: 120 x 180 + 500 set-up = 22,100 cedis", () => {
  const t = calculateTotals({ packageId: "gold", guests: 180 });
  assert.equal(t.packageTotal, 2160000);
  assert.equal(t.total, 2210000);
  assert.equal(t.balance, 2210000);
  assert.deepEqual(t.warnings, []);
});

test("extras, discount and deposit all feed into the balance", () => {
  const t = calculateTotals({
    packageId: "silver",
    guests: 150,
    extras: [{ name: "Fish balls", amount: 30000 }],
    discount: 50000,
    deposit: 500000,
  });
  // 100 x 150 = 15,000 + 500 + 300 - 500 = 15,300 total, minus 5,000 deposit
  assert.equal(t.total, 1530000);
  assert.equal(t.balance, 1030000);
});

test("under 150 guests still calculates but warns", () => {
  const t = calculateTotals({ packageId: "bronze", guests: 100 });
  assert.equal(t.total, 850000);
  assert.equal(t.warnings.length, 1);
});

test("deposit bigger than total warns instead of hiding it", () => {
  const t = calculateTotals({ packageId: "bronze", guests: 150, deposit: 5000000 });
  assert.ok(t.balance < 0);
  assert.ok(t.warnings.some((w) => w.includes("Deposit")));
});

test("rejects decimals in pesewas and unknown packages", () => {
  assert.throws(() => calculateTotals({ packageId: "gold", guests: 150.5 }));
  assert.throws(() => calculateTotals({ packageId: "platinum", guests: 150 }));
});

test("cedisToPesewas parses typed amounts without float errors", () => {
  assert.equal(cedisToPesewas("120"), 12000);
  assert.equal(cedisToPesewas("120.5"), 12050);
  assert.equal(cedisToPesewas("1,200.05"), 120005);
  assert.throws(() => cedisToPesewas("12.345"));
  assert.throws(() => cedisToPesewas("abc"));
});

test("formatGHS shows cedis with two decimals", () => {
  assert.equal(formatGHS(2210000), "GHS 22,100.00");
  assert.equal(formatGHS(5), "GHS 0.05");
});
