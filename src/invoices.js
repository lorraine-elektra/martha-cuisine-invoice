// Checks what the browser sends and works out the totals on the server.
// The browser's own totals are never trusted or stored.
import { calculateTotals } from "./totals.js";

export class ValidationError extends Error {}

const text = (v, label, max = 200) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new ValidationError(`${label} is too long`);
  return s;
};

const dateOrEmpty = (v, label) => {
  const s = typeof v === "string" ? v : "";
  if (s !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError(`${label} is not a valid date`);
  return s;
};

const whole = (v, label, max) => {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new ValidationError(`${label} must be a valid number`);
  return v;
};

const MAX_MONEY = 100_000_000_00; // GHS 100 million, in pesewas

export function checkInvoiceInput(input) {
  if (typeof input !== "object" || input === null) throw new ValidationError("Invalid invoice");
  const clientName = text(input.clientName, "Client name");
  if (!clientName) throw new ValidationError("Client name is required");

  const linesIn = Array.isArray(input.lines) ? input.lines : [];
  if (linesIn.length < 1) throw new ValidationError("Add at least one item");
  if (linesIn.length > 40) throw new ValidationError("Too many items");
  const lines = linesIn.map((l, i) => {
    const description = text(l?.description, `Item ${i + 1} description`, 200);
    if (!description) throw new ValidationError(`Item ${i + 1} needs a description`);
    const quantity = whole(l?.quantity, `Item ${i + 1} quantity`, 1_000_000);
    if (quantity < 1) throw new ValidationError(`Item ${i + 1} quantity must be at least 1`);
    const unitPrice = whole(l?.unitPrice, `Item ${i + 1} price`, MAX_MONEY);
    if (unitPrice < 1) throw new ValidationError(`Item ${i + 1} needs a price`);
    return { description, quantity, unitPrice };
  });

  const dishesIn = Array.isArray(input.dishes) ? input.dishes : [];
  if (dishesIn.length > 60) throw new ValidationError("Too many dishes");

  const discountType = input.discountType === "percent" ? "percent" : "amount";
  const values = {
    clientName,
    clientPhone: text(input.clientPhone, "Client phone", 40),
    eventDate: dateOrEmpty(input.eventDate, "Event date"),
    venue: text(input.venue, "Venue"),
    invoiceDate: dateOrEmpty(input.invoiceDate, "Invoice date"),
    notes: text(input.notes, "Notes", 1000),
    dishes: dishesIn.map((d) => text(d, "Dish", 100)).filter(Boolean),
    lines,
    discountType,
    discountValue: whole(input.discountValue ?? 0, "Discount", discountType === "percent" ? 10000 : MAX_MONEY),
    deposit: whole(input.deposit ?? 0, "Deposit", MAX_MONEY),
  };

  let totals;
  try {
    totals = calculateTotals(values);
  } catch (err) {
    throw new ValidationError(err.message);
  }
  return { values, totals };
}
