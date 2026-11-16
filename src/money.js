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

/** Turn a typed percentage like "10" or "7.5" into basis points (1000 or 750). Max 100%. */
export function percentToBp(input) {
  const text = String(input).replace(/%/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`Not a valid percentage: "${input}"`);
  const [whole, fraction = ""] = text.split(".");
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (bp > 10000) throw new Error("A percentage cannot be more than 100");
  return bp;
}

/** 750 -> "7.5%", 1000 -> "10%" */
export function formatPercent(bp) {
  return `${Number((bp / 100).toFixed(2))}%`;
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
