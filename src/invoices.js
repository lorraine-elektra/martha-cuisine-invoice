// Checks what the browser sends and works out the totals on the server.
// The browser's own totals are never trusted or stored.
import { calculateTotals } from "./totals.js";
import { PACKAGES } from "./packages.js";

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

const pesewas = (v, label) => {
  if (!Number.isInteger(v) || v < 0 || v > 100_000_000_00) {
    throw new ValidationError(`${label} must be a valid amount`);
  }
  return v;
};

export function checkInvoiceInput(input) {
  if (typeof input !== "object" || input === null) throw new ValidationError("Invalid invoice");
  if (!PACKAGES[input.packageId]) throw new ValidationError("Unknown package");
  if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > 100000) {
    throw new ValidationError("Guests must be a whole number");
  }
  const clientName = text(input.clientName, "Client name");
  if (!clientName) throw new ValidationError("Client name is required");

  const extrasIn = Array.isArray(input.extras) ? input.extras : [];
  if (extrasIn.length > 30) throw new ValidationError("Too many extras");
  const extras = extrasIn.map((e) => ({
    name: text(e?.name, "Extra name", 100) || "Extra",
    amount: pesewas(e?.amount, "Extra amount"),
  }));

  const dishesIn = Array.isArray(input.dishes) ? input.dishes : [];
  if (dishesIn.length > 60) throw new ValidationError("Too many dishes");
  const dishes = dishesIn.map((d) => text(d, "Dish", 100)).filter(Boolean);

  const values = {
    clientName,
    clientPhone: text(input.clientPhone, "Client phone", 40),
    eventDate: dateOrEmpty(input.eventDate, "Event date"),
    venue: text(input.venue, "Venue"),
    invoiceDate: dateOrEmpty(input.invoiceDate, "Invoice date"),
    packageId: input.packageId,
    guests: input.guests,
    extras,
    dishes,
    discount: pesewas(input.discount ?? 0, "Discount"),
    deposit: pesewas(input.deposit ?? 0, "Deposit"),
    notes: text(input.notes, "Notes", 1000),
  };

  let totals;
  try {
    totals = calculateTotals(values);
  } catch (err) {
    throw new ValidationError(err.message);
  }
  return { values, totals };
}
