// Builds a WhatsApp "click to chat" link. Works in the browser and in tests.

/** "0546155309" or "+233 54 615 5309" -> "233546155309". Returns "" if it doesn't look like a Ghana number. */
export function ghanaNumber(input) {
  const digits = String(input ?? "").replace(/[^\d]/g, "");
  if (/^0\d{9}$/.test(digits)) return "233" + digits.slice(1);
  if (/^233\d{9}$/.test(digits)) return digits;
  return "";
}

export function whatsappLink({ phone, clientName, number, balanceText }) {
  const message =
    `Hello ${clientName}, thank you for choosing Martha's Cuisines. ` +
    `Your invoice ${number} is attached. Balance due: ${balanceText}. ` +
    `You can pay by bank transfer (Fidelity Bank, Madina Branch, account 2030453360411) ` +
    `or mobile money (0546155309), both in the name of Mawufemor Afi Gborglah.`;
  const to = ghanaNumber(phone);
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}
