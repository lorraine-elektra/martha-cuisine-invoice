import { api, wireLogout } from "/js/api.js";
import { formatGHS } from "/src/money.js";
import { el, toast, confirmDialog, withLoading } from "/js/ui.js";

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

// Opens the payment-method dialog; resolves to "cash" | "momo" | "bank", or null if cancelled.
function askMethod(inv, opener) {
  return new Promise((resolve) => {
    document.querySelector("#pay-for").textContent = `${inv.number}, ${inv.clientName}`;
    payForm.reset();
    const done = (value) => {
      payForm.removeEventListener("submit", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close();
      opener.focus();
      resolve(value);
    };
    const onSubmit = (e) => { e.preventDefault(); done(new FormData(payForm).get("method")); };
    const onCancel = () => done(null);
    const onClose = () => done(null); // Escape key
    const cancelBtn = document.querySelector("#pay-cancel");
    payForm.addEventListener("submit", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.showModal();
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
    : inv.status === "paid" && inv.paymentMethod === want;

let fetched = [];
function render() {
  const want = show.value;
  const invoices = fetched.filter((inv) => matches(inv, want));
  const searching = search.value.trim() !== "";
  const narrowed = searching || want !== "all";
  count.textContent = `${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"}${narrowed ? " found" : ""}`;
  if (!invoices.length) {
    list.replaceChildren(el("li", { class: "empty" },
      want !== "all" && fetched.length ? "No invoices to show here. Choose All invoices to see the rest."
        : searching ? "No invoices match your search. Check the spelling or try the invoice number."
        : el("span", {}, "There are no invoices yet. ", el("a", { href: "/", text: "Create the first one." }))));
    return;
  }
  list.replaceChildren(...invoices.map((inv) => {
    const paid = inv.status === "paid";
    const toggle = el("button", {
      type: "button", class: "secondary", text: paid ? "Mark unpaid" : "Mark paid",
      "aria-label": `${paid ? "Mark unpaid" : "Mark paid"}: ${inv.number}, ${inv.clientName}`,
    });
    async function send(body, doneMessage) {
      await withLoading(toggle, "Saving...", async () => {
        try { await api(`/invoices/${inv.id}/paid`, { method: "POST", body }); toast(doneMessage); await load({ quiet: true }); }
        catch (err) { toast(err.message + ".", { type: "error" }); }
      });
    }
    toggle.addEventListener("click", async () => {
      if (paid) {
        const yes = await confirmDialog({
          title: "Mark as unpaid?", message: `Invoice ${inv.number} for ${inv.clientName} will show as unpaid again.`,
          confirmLabel: "Mark unpaid",
        });
        if (yes) send({ paid: false }, `${inv.number} marked as unpaid.`);
        else toggle.focus();
        return;
      }
      const method = await askMethod(inv, toggle);
      if (method) send({ paid: true, method }, `${inv.number} marked as paid.`);
    });
    return el("li", { class: "inv-item" },
      el("a", { class: "inv-main", href: "/?id=" + inv.id, "aria-label": `Open invoice ${inv.number} for ${inv.clientName}` },
        el("strong", { text: inv.number }),
        el("span", { text: inv.clientName }),
        inv.eventDate ? el("span", { class: "small", text: niceDate(inv.eventDate) }) : null),
      el("div", { class: "inv-side" },
        el("span", { class: "balance-cell" }, el("span", { class: "small", text: "Balance due" }),
          el("strong", { text: formatGHS(Math.max(0, inv.balance)) })),
        el("span", { class: paid ? "status paid" : "status", text: paid ? (METHODS[inv.paymentMethod] ? `Paid by ${METHODS[inv.paymentMethod]}` : "Paid") : "Unpaid" }),
        toggle));
  }));
}

let timer;
search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250); });
show.addEventListener("change", render);
load();
