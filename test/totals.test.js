import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTotals, percentOf } from "../src/totals.js";
import { cedisToPesewas, percentToBp, formatPercent, formatGHS } from "../src/money.js";

const gold = { description: "Gold package", quantity: 180, unitPrice: 12000 };
const setup = { description: "Set-up charge", quantity: 1, unitPrice: 50000 };

test("manual lines: 120 x 180 + 500 set-up = 22,100 cedis", () => {
  const t = calculateTotals({ lines: [gold, setup] });
  assert.equal(t.lines[0].amount, 2160000);
  assert.equal(t.subtotal, 2210000);
  assert.equal(t.total, 2210000);
  assert.equal(t.balance, 2210000);
  assert.deepEqual(t.warnings, []);
});

test("any price and quantity works, not just the rate card", () => {
  const t = calculateTotals({ lines: [{ description: "Wedding cake", quantity: 3, unitPrice: 45050 }] });
  assert.equal(t.total, 135150);
});

test("fixed amount discount, then deposit", () => {
  const t = calculateTotals({ lines: [gold, setup], discountType: "amount", discountValue: 50000, deposit: 500000 });
  assert.equal(t.discount, 50000);
  assert.equal(t.total, 2160000);
  assert.equal(t.balance, 1660000);
});

test("percent discount comes off the subtotal", () => {
  const t = calculateTotals({ lines: [gold, setup], discountType: "percent", discountValue: 1000 }); // 10%
  assert.equal(t.discount, 221000);
  assert.equal(t.total, 1989000);
});

test("tax is charged on the amount after discount", () => {
  const t = calculateTotals({ lines: [{ description: "Item", quantity: 1, unitPrice: 100000 }], discountType: "percent", discountValue: 1000, taxBp: 1250 });
  assert.equal(t.afterDiscount, 90000);
  assert.equal(t.tax, 11250); // 12.5% of 900.00
  assert.equal(t.total, 101250);
});

test("percentages round to the nearest pesewa", () => {
  assert.equal(percentOf(1001, 1000), 100); // 100.1 -> 100
  assert.equal(percentOf(1005, 1000), 101); // 100.5 -> 101
});

test("discount bigger than the subtotal is limited and warns", () => {
  const t = calculateTotals({ lines: [setup], discountType: "amount", discountValue: 999999 });
  assert.equal(t.discount, 50000);
  assert.equal(t.total, 0);
  assert.equal(t.warnings.length, 1);
});

test("deposit bigger than total warns instead of hiding it", () => {
  const t = calculateTotals({ lines: [setup], deposit: 90000 });
  assert.ok(t.balance < 0);
  assert.ok(t.warnings.some((w) => w.includes("Deposit")));
});

test("no minimum guest rule any more", () => {
  const t = calculateTotals({ lines: [{ description: "Small party", quantity: 20, unitPrice: 8000 }] });
  assert.deepEqual(t.warnings, []);
});

test("rejects decimals and negatives", () => {
  assert.throws(() => calculateTotals({ lines: [{ description: "x", quantity: 1.5, unitPrice: 100 }] }));
  assert.throws(() => calculateTotals({ lines: [{ description: "x", quantity: 1, unitPrice: -100 }] }));
  assert.throws(() => calculateTotals({ lines: [setup], taxBp: 10001 }));
  assert.throws(() => calculateTotals({ lines: [setup], discountType: "percent", discountValue: 10001 }));
  assert.throws(() => calculateTotals({ lines: [setup], discountType: "bogus" }));
});

test("cedisToPesewas parses typed amounts without float errors", () => {
  assert.equal(cedisToPesewas("120"), 12000);
  assert.equal(cedisToPesewas("120.5"), 12050);
  assert.equal(cedisToPesewas("1,200.05"), 120005);
  assert.throws(() => cedisToPesewas("12.345"));
  assert.throws(() => cedisToPesewas("abc"));
});

test("percentToBp and formatPercent", () => {
  assert.equal(percentToBp("10"), 1000);
  assert.equal(percentToBp("7.5%"), 750);
  assert.equal(percentToBp("100"), 10000);
  assert.throws(() => percentToBp("100.01"));
  assert.throws(() => percentToBp("abc"));
  assert.equal(formatPercent(750), "7.5%");
  assert.equal(formatPercent(1000), "10%");
});

test("formatGHS shows cedis with two decimals", () => {
  assert.equal(formatGHS(2210000), "GHS 22,100.00");
  assert.equal(formatGHS(5), "GHS 0.05");
});
