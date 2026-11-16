// Small shared helpers for every page: toasts, a confirm dialog and per-field error messages.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

// ---------- toasts ----------
// type: "success" (default) or "error". An action ({ label, onClick }) adds a button such as Undo.
export function toast(message, { type = "success", action = null, duration } = {}) {
  let host = document.querySelector("#toasts");
  if (!host) {
    host = el("div", { id: "toasts", class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(host);
  }
  const note = el("div", { class: "toast " + type }, el("span", { class: "toast-text", text: message }));
  const close = () => note.remove();
  if (action) {
    const btn = el("button", { type: "button", class: "toast-action", text: action.label });
    btn.addEventListener("click", () => { close(); action.onClick(); });
    note.append(btn);
  }
  host.append(note);
  const ms = duration ?? (action ? 6000 : type === "error" ? 6000 : 3500);
  setTimeout(close, ms);
}

// ---------- confirm dialog (replaces the browser's plain confirm box) ----------
export function confirmDialog({ title, message, confirmLabel = "Yes", cancelLabel = "Cancel" }) {
  return new Promise((resolve) => {
    const dialog = el("dialog", { class: "dialog", "aria-labelledby": "dlg-title", "aria-describedby": "dlg-msg" },
      el("h2", { id: "dlg-title", text: title }),
      el("p", { id: "dlg-msg", text: message }),
      el("div", { class: "dialog-actions" },
        el("button", { type: "button", class: "secondary", "data-answer": "no", text: cancelLabel }),
        el("button", { type: "button", "data-answer": "yes", text: confirmLabel })));
    let finished = false;
    const finish = (answer) => { // runs once, whichever way the dialog ends
      if (finished) return;
      finished = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(answer);
    };
    dialog.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-answer]");
      if (btn) finish(btn.dataset.answer === "yes");
      else if (e.target === dialog) finish(false); // click on the dim backdrop
    });
    dialog.addEventListener("close", () => finish(false)); // Escape key
    document.body.append(dialog);
    if (typeof dialog.showModal !== "function") { dialog.remove(); resolve(window.confirm(message)); return; }
    dialog.showModal();
    dialog.querySelector('[data-answer="no"]').focus(); // the safe choice has focus first
  });
}

// ---------- field errors ----------
// Every field has a <p class="field-error" id="err-<field id>"> under it.
const errorBox = (input) => document.getElementById("err-" + input.id);

export function setError(input, message) {
  const box = errorBox(input);
  input.setAttribute("aria-invalid", "true");
  if (box) box.textContent = message;
}
// A warning shows text under the field without marking it invalid.
export function setWarning(input, message) {
  const box = errorBox(input);
  if (box) box.textContent = message;
}
export function clearError(input) {
  input.removeAttribute("aria-invalid");
  const box = errorBox(input);
  if (box) box.textContent = "";
}

// Wraps a button's busy state: shows "Saving..." style text and a spinner, blocks double clicks.
export async function withLoading(button, loadingText, task) {
  const original = button.textContent;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  button.textContent = loadingText;
  try { return await task(); }
  finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    button.textContent = original;
  }
}
