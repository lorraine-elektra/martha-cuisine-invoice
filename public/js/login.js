import { setError, clearError, withLoading } from "/js/ui.js";

const form = document.querySelector("#login-form");
const password = form.elements.password;
const button = form.querySelector("button");

password.addEventListener("input", () => clearError(password));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(password);
  if (!password.value) { setError(password, "Enter your password."); password.focus(); return; }
  await withLoading(button, "Logging in...", async () => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.value }),
      });
      if (res.ok) {
        location.href = "/invoices.html";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(password, (data.error ?? "Could not log in") + ".");
      password.select();
    } catch {
      setError(password, "Could not reach the server. Check your internet connection and try again.");
    }
  });
});
