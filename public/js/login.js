import { setError, clearError, withLoading } from "/js/ui.js";

const form = document.querySelector("#login-form");
const pin = form.elements.pin;
const button = form.querySelector("button");

pin.addEventListener("input", () => { pin.value = pin.value.replace(/\D/g, ""); clearError(pin); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(pin);
  if (!pin.value) { setError(pin, "Enter your PIN."); pin.focus(); return; }
  await withLoading(button, "Logging in...", async () => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.value }),
      });
      if (res.ok) {
        location.href = "/invoices.html";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(pin, (data.error ?? "Could not log in") + ".");
      pin.value = "";
      pin.focus();
    } catch {
      setError(pin, "Could not reach the server. Check your internet connection and try again.");
    }
  });
});
