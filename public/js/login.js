const form = document.querySelector("#login-form");
const error = document.querySelector("#error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  error.textContent = "";
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: form.elements.password.value }),
  });
  if (res.ok) {
    location.href = "/invoices.html";
  } else {
    error.textContent = (await res.json()).error ?? "Could not log in";
    form.elements.password.select();
  }
});
