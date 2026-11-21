import { api, wireLogout } from "/js/api.js";
import { formatGHS } from "/src/money.js";
import { el, toast, withLoading, setError, clearError } from "/js/ui.js";
import { wireNavMenu } from "/js/nav.js";

const list = document.querySelector("#list");
const msg = document.querySelector("#msg");
const count = document.querySelector("#count");
const search = document.querySelector("#q");
const show = document.querySelector("#show");
wireLogout();

const niceDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const METHODS = { cash: "Cash", momo: "MoMo", bank: "Bank" };
const dialog = document.querySelector("#pay-dialog");
const payForm = document.querySelector("#pay-form");

function methodKey(inv) {
  const raw = inv.paymentMethod ?? inv.payment_method ?? "";
  const key = String(raw).trim().toLowerCase();
  return METHODS[key] ? key : "";
}

const pinInput = document.querySelector("#pay-pin");
pinInput.addEventListener("input", () => { pinInput.value = pinInput.value.replace(/\D/g, ""); clearError(pinInput); });

// Opens the payment dialog; resolves to { method, pin }, or null if cancelled. `problem` shows a PIN error.
function askMethod(inv, opener, problem = "") {
  return new Promise((resolve) => {
    document.querySelector("#pay-for").textContent = `${inv.number}, ${inv.clientName}`;
    payForm.reset();
    clearError(pinInput);
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      payForm.removeEventListener("submit", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onCancelKey);
      if (dialog.open) dialog.close();
      opener.focus();
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      const checked = payForm.querySelector('input[name="method"]:checked');
      if (!checked) return;
      if (!/^\d{4,8}$/.test(pinInput.value)) { setError(pinInput, "Enter your PIN (4 to 8 digits)."); pinInput.focus(); return; }
      done({ method: checked.value, pin: pinInput.value });
    };
    const onCancel = () => done(null);
    const onCancelKey = (e) => { e.preventDefault(); onCancel(); };
    const cancelBtn = document.querySelector("#pay-cancel");
    payForm.addEventListener("submit", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onCancelKey);
    dialog.showModal();
    if (problem) { setError(pinInput, problem); pinInput.focus(); }
  });
}

const skeletons = () => [1, 2, 3].map(() => el("li", { class: "skeleton", "aria-hidden": "true" }));

let latest = 0; // so a slow, older search can never overwrite a newer one
async function load({ quiet = false } = {}) {
  const mine = ++latest;
  msg.textContent = "";
  if (!quiet) { list.replaceChildren(...skeletons()); count.textContent = ""; }
  let invoices;
  try {
    invoices = await api("/invoices?q=" + encodeURIComponent(search.value.trim()));
  } catch (err) {
    if (mine !== latest) return;
    list.replaceChildren();
    msg.textContent = err.message + ". Check your connection and try again.";
    return;
  }
  if (mine !== latest) return;
  fetched = invoices;
  render();
}

// Which invoices the "Show" dropdown lets through.
const matches = (inv, want) =>
  want === "all" ? true
    : want === "unpaid" ? inv.status !== "paid"
    : want === "paid" ? inv.status === "paid"
    : inv.status === "paid" && methodKey(inv) === want;

let fetched = [];
function render() {
  const want = show.value;
  const invoices = fetched.filter((inv) => matches(inv, want));
  const searching = search.value.trim() !== "";
  count.textContent = `${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"} found`;
  if (!invoices.length) {
    list.replaceChildren(el("li", { class: "empty" },
      want !== "all" && fetched.length ? "No invoices to show here. Choose All invoices to see the rest."
        : searching ? "No invoices match your search. Check the spelling or try the invoice number."
        : el("span", {}, "There are no invoices yet. ", el("a", { href: "/", text: "Create the first one." }))));
    return;
  }
  list.replaceChildren(...invoices.map((inv) => {
    const paid = inv.status === "paid";
    const key = methodKey(inv);
    // A paid invoice is locked: no button at all, unless it is an old one still missing its payment method.
    const label = paid ? "Add payment method" : "Mark paid";
    const toggle = paid && key ? null : el("button", {
      type: "button", class: "secondary", text: label,
      "aria-label": `${label}: ${inv.number}, ${inv.clientName}`,
    });
    // Returns an error message when the PIN was refused (so the dialog can open again), otherwise "".
    async function send(body, doneMessage) {
      let pinProblem = "";
      await withLoading(toggle, "Saving...", async () => {
        try { await api(`/invoices/${inv.id}/paid`, { method: "POST", body }); toast(doneMessage, { type: "success" }); await load({ quiet: true }); }
        catch (err) {
          if (err.pinRequired) pinProblem = err.message + ".";
          else toast(err.message + ".", { type: "error" });
        }
      });
      return pinProblem;
    }
    toggle?.addEventListener("click", async () => {
      let problem = "";
      for (;;) {
        const answer = await askMethod(inv, toggle, problem);
        if (!answer) return;
        problem = await send({ paid: true, method: answer.method, pin: answer.pin },
          `${inv.number} marked as paid via ${METHODS[answer.method]}.`);
        if (!problem) return;
      }
    });
    return el("li", { class: "inv-item" },
      el("a", { class: "inv-main", href: "/?id=" + inv.id, "aria-label": `${paid ? "View paid" : "Open"} invoice ${inv.number} for ${inv.clientName}` },
        el("strong", { text: inv.number }),
        el("span", { text: inv.clientName }),
        inv.eventDate ? el("span", { class: "small", text: niceDate(inv.eventDate) }) : null),
      el("div", { class: "inv-side" },
        el("span", { class: "balance-cell" }, el("span", { class: "small", text: "Balance due" }),
          el("strong", { text: formatGHS(Math.max(0, inv.balance)) })),
        el("span", { class: "status-wrap" },
          el("span", {
            class: paid ? "status paid" : "status",
            text: paid ? (key ? `Paid (${METHODS[key]})` : "Paid") : "Unpaid",
          })),
        toggle ? el("div", { class: "inv-actions" }, toggle) : null));
  }));
}

let timer;
search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250); });
show.addEventListener("change", render);
load();

wireNavMenu();

// Scroll to top on page load
window.scrollTo(0, 0);
