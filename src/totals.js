import { PACKAGES, SETUP_CHARGE, MIN_GUESTS } from "./packages.js";

function assertWhole(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number of 0 or more`);
  }
}

/**
 * Work out an invoice. All money is in pesewas (whole numbers).
 * It never changes your numbers quietly: problems come back as warnings.
 */
export function calculateTotals({
  packageId,
  guests,
  extras = [],
  discount = 0,
  deposit = 0,
}) {
  const pkg = PACKAGES[packageId];
  if (!pkg) throw new Error(`Unknown package: ${packageId}`);
  assertWhole(guests, "Guests");
  assertWhole(discount, "Discount");
  assertWhole(deposit, "Deposit");
  extras.forEach((e) => assertWhole(e.amount, `Extra "${e.name}"`));

  const packageTotal = pkg.ratePerHead * guests;
  const extrasTotal = extras.reduce((sum, e) => sum + e.amount, 0);
  const subtotal = packageTotal + SETUP_CHARGE + extrasTotal;
  const total = subtotal - discount;
  const balance = total - deposit;

  const warnings = [];
  if (guests < MIN_GUESTS) {
    warnings.push(`Rate card minimum is ${MIN_GUESTS} guests`);
  }
  if (discount > subtotal) {
    warnings.push("Discount is bigger than the subtotal");
  }
  if (deposit > total) {
    warnings.push("Deposit is bigger than the total");
  }

  return {
    ratePerHead: pkg.ratePerHead,
    packageTotal,
    setupCharge: SETUP_CHARGE,
    extrasTotal,
    subtotal,
    discount,
    total,
    deposit,
    balance,
    warnings,
  };
}
