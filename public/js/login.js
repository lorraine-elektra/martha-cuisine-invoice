const form = document.querySelector("#login-form");
const error = document.querySelector("#error");
const button = form.querySelector("button");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  error.textContent = "";
  button.disabled = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.elements.password.value }),
    });
    if (res.ok) {
      location.href = "/invoices.html";
      return;
    }
    const data = await res.json().catch(() => ({}));
    error.textContent = (data.error ?? "Could not log in") + ".";
    form.elements.password.select();
  } catch {
    error.textContent = "Could not reach the server. Check your internet connection and try again.";
  } finally {
    button.disabled = false;
  }
});
