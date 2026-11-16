// Works out an invoice from lines the client types in. All money is whole pesewas.
// A percentage discount is in basis points: 100 = 1%, 750 = 7.5%, 10000 = 100%.
// Nothing is changed quietly: problems come back as warnings.

function assertWhole(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} must be a whole number of 0 or more`);
  }
}

/** Percent of an amount, rounded to the nearest pesewa (halves round up). */
export function percentOf(amount, basisPoints) {
  return Math.round((amount * basisPoints) / 10000);
}

export function calculateTotals({
  lines = [],
  discountType = "amount", // "amount" (pesewas) or "percent" (basis points)
  discountValue = 0,
  deposit = 0,
}) {
  if (discountType !== "amount" && discountType !== "percent") {
    throw new Error("Discount type must be amount or percent");
  }
  assertWhole(discountValue, "Discount");
  assertWhole(deposit, "Deposit");
  if (discountType === "percent") assertWhole(discountValue, "Discount", 10000);

  const priced = lines.map((line, i) => {
    const label = `Line ${i + 1}`;
    assertWhole(line.quantity, `${label} quantity`);
    assertWhole(line.unitPrice, `${label} price`);
    return { ...line, amount: line.quantity * line.unitPrice };
  });

  const subtotal = priced.reduce((sum, l) => sum + l.amount, 0);
  const warnings = [];

  let discount = discountType === "percent" ? percentOf(subtotal, discountValue) : discountValue;
  if (discount > subtotal) {
    warnings.push("Discount is bigger than the subtotal, so it was limited to the subtotal");
    discount = subtotal;
  }

  const total = subtotal - discount;
  const balance = total - deposit;
  if (deposit > total) warnings.push("Deposit is bigger than the total");

  return { lines: priced, subtotal, discount, total, deposit, balance, warnings };
}
