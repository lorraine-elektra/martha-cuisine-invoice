// Money is always stored as whole pesewas (100 pesewas = 1 cedi).
// Whole numbers never suffer from the 0.1 + 0.2 problem.

/** Turn a typed amount like "120", "120.5" or "1,200.50" into pesewas. */
export function cedisToPesewas(input) {
  const text = String(input).replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error(`Not a valid cedi amount: "${input}"`);
  }
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Turn pesewas into a display string like "GHS 22,100.00". */
export function formatGHS(pesewas) {
  if (!Number.isInteger(pesewas)) {
    throw new Error("Pesewas must be a whole number");
  }
  const sign = pesewas < 0 ? "-" : "";
  const abs = Math.abs(pesewas);
  const cedis = Math.floor(abs / 100).toLocaleString("en-GH");
  const pes = String(abs % 100).padStart(2, "0");
  return `${sign}GHS ${cedis}.${pes}`;
}
