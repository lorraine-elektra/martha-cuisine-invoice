import { calculateTotals } from "/src/totals.js";
import { cedisToPesewas, percentToBp, formatGHS, formatPercent } from "/src/money.js";
import { MENU, ITEM_SUGGESTIONS } from "/src/menu.js";
import { api, wireLogout } from "/js/api.js";
import { whatsappLink } from "/src/whatsapp.js";
import { el, toast, setError, setWarning, clearError, withLoading } from "/js/ui.js";

// The saved invoice this screen is showing. id and number are null until the first save.
const state = { id: null, number: null, status: "unpaid" };

// Same limits the server enforces (src/invoices.js).
const MAX_MONEY = 100_000_000_00; // GHS 100 million, in pesewas
const MAX_QTY = 1_000_000;
const MAX_ITEMS = 40;

const form = document.querySelector("#builder");
const f = form.elements;
const invoiceEl = document.querySelector("#invoice");
const notices = document.querySelector("#notices");
const barBalance = document.querySelector("#bar-balance");
const linesEl = document.querySelector("#lines");
const itemsEmpty = document.querySelector("#items-empty");
const saveBtn = document.querySelector("#save");
const printBtn = document.querySelector("#print");
const addBtn = document.querySelector("#add-line");
const cancelEditBtn = document.querySelector("#cancel-edit");
const draftEl = document.querySelector("#draft");
const draftNote = document.querySelector("#err-draft");
const itemsNote = document.querySelector("#err-items");

// One logo element, reused on every redraw, so the picture does not reload or flicker while typing.
const logoEl = el("img", { class: "inv-logo", src: "/assets/logo.jpeg", alt: "Martha's Cuisines" });

// ---------- dish checkboxes (optional menu list) ----------
const dishGroups = [
  ["Starters", "starters"], ["Desserts", "desserts"], ["Rice dishes", "rice"], ["Local dishes", "local"],
];
const dishesEl = document.querySelector("#dishes");
for (const [title, key] of dishGroups) {
  dishesEl.append(
    el("div", { class: "dish-group" }, el("h3", { text: title }),
      ...MENU[key].map((name) =>
        el("label", { class: "dish" }, el("input", { type: "checkbox", name: "dish", value: name }), name))),
  );
}

// ---------- typing filters: numbers only ----------
// Quantity: digits only (a pasted "2.5" becomes "2"). Money: digits and one dot, two decimals, commas dropped.
const cleanWhole = (raw) => raw.replace(/[,\s]/g, "").match(/^\d*/)[0];
function cleanMoney(raw) {
  let s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return s;
}
f.discountValue.dataset.kind = "money";
f.deposit.dataset.kind = "money";
form.addEventListener("input", (e) => {
  const input = e.target;
  const kind = input.dataset?.kind;
  if (!kind) return;
  const clean = kind === "whole" ? cleanWhole(input.value) : cleanMoney(input.value);
  if (clean !== input.value) input.value = clean;
});

// ---------- parsing ----------
// Return pesewas (or whole numbers) for valid text, or null for a typo. Empty text is 0.
function parseMoney(raw) {
  let t = raw.trim().replace(/,/g, "");
  if (t === "") return 0;
  if (t.endsWith(".")) t = t.slice(0, -1);
  if (t.startsWith(".")) t = "0" + t;
  try { return cedisToPesewas(t); } catch { return null; }
}
function parsePercent(raw) {
  let t = raw.trim();
  if (t === "") return 0;
  if (t.endsWith(".")) t = t.slice(0, -1);
  if (t.startsWith(".")) t = "0" + t;
  try { return percentToBp(t); } catch { return null; }
}

// ---------- item entry (the "draft" row) ----------
const OTHER = "__other__";
const itemGroups = [
  ["Packages and charges", ITEM_SUGGESTIONS.filter((n) => !MENU.extras.includes(n))],
  ["Starters", MENU.starters], ["Rice dishes", MENU.rice], ["Local dishes", MENU.local],
  ["Extras", MENU.extras], ["Desserts", MENU.desserts],
];
const allItemNames = itemGroups.flatMap(([, names]) => names);

// A label, the input and an empty error line under it. The error line is wired up with aria-describedby.
function field(labelText, input, extraClass = "") {
  input.setAttribute("aria-describedby", "err-" + input.id);
  return el("div", { class: "field " + extraClass },
    el("label", { for: input.id, text: labelText }), input,
    el("p", { class: "field-error", id: "err-" + input.id }));
}

const draft = {
  select: el("select", { id: "draft-item", class: "line-select" },
    el("option", { value: "", text: "Choose an item..." }),
    ...itemGroups.map(([label, names]) =>
      el("optgroup", { label }, ...names.map((n) => el("option", { value: n, text: n })))),
    el("option", { value: OTHER, text: "Other (type my own)" })),
  other: el("input", { id: "draft-other", maxlength: "200", enterkeyhint: "next" }),
  qty: el("input", { id: "draft-qty", inputmode: "numeric", maxlength: "7", enterkeyhint: "next" }),
  price: el("input", { id: "draft-price", inputmode: "decimal", maxlength: "13", enterkeyhint: "done" }),
};
draft.qty.dataset.kind = "whole";
draft.price.dataset.kind = "money";
const otherField = field("Item name", draft.other, "draft-other");
otherField.hidden = true;
draftEl.append(
  field("Package or item", draft.select, "draft-desc"),
  otherField,
  field("Quantity", draft.qty, "draft-qty"),
  field("Price for one (GHS)", draft.price, "draft-price"));

let items = [];
let editIndex = null; // which item is being edited in the draft row, or null when adding a new one
let dirty = false;

const draftInputs = [draft.select, draft.other, draft.qty, draft.price];
const draftHasContent = () => draftInputs.some((x) => x.value.trim() !== "");

function resetDraft() {
  draft.select.value = ""; draft.other.value = ""; draft.qty.value = ""; draft.price.value = "";
  otherField.hidden = true;
  draftInputs.forEach(clearError);
  draftNote.textContent = "";
  editIndex = null;
  addBtn.textContent = "Add item";
  cancelEditBtn.hidden = true;
  linesEl.querySelectorAll(".item.is-editing").forEach((li) => li.classList.remove("is-editing"));
}

draft.select.addEventListener("change", () => {
  clearError(draft.select);
  draftNote.textContent = "";
  if (draft.select.value === OTHER) { otherField.hidden = false; draft.other.focus(); }
  else { otherField.hidden = true; draft.other.value = ""; if (draft.select.value) draft.qty.focus(); }
});
draftEl.addEventListener("input", (e) => { clearError(e.target); draftNote.textContent = ""; });

function startEdit(i) {
  const it = items[i];
  editIndex = i;
  const known = allItemNames.includes(it.description);
  draft.select.value = known ? it.description : OTHER;
  otherField.hidden = known;
  draft.other.value = known ? "" : it.description;
  draft.qty.value = String(it.quantity);
  draft.price.value = (it.unitPrice / 100).toFixed(2);
  draftInputs.forEach(clearError);
  draftNote.textContent = "";
  addBtn.textContent = "Update item";
  cancelEditBtn.hidden = false;
  linesEl.querySelectorAll(".item").forEach((li, n) => li.classList.toggle("is-editing", n === i));
  draftEl.scrollIntoView({ block: "center", behavior: "smooth" });
  (known ? draft.qty : draft.other).focus();
}
cancelEditBtn.addEventListener("click", () => { resetDraft(); draft.select.focus(); });

const subtotalWithout = (skip) =>
  items.reduce((sum, it, i) => (i === skip ? sum : sum + it.quantity * it.unitPrice), 0);

function addItem() {
  draftInputs.forEach(clearError);
  draftNote.textContent = "";
  itemsNote.textContent = "";
  const isOther = draft.select.value === OTHER;
  const description = (isOther ? draft.other.value : draft.select.value).trim();
  let firstBad = null;
  const bad = (input, message) => { setError(input, message); firstBad ??= input; };

  if (items.length >= MAX_ITEMS && editIndex === null) bad(draft.select, `An invoice can have up to ${MAX_ITEMS} items.`);
  else if (!draft.select.value) bad(draft.select, "Choose an item, or pick “Other” to type your own.");
  else if (!description) bad(draft.other, "Type the item name.");

  const quantity = draft.qty.value.trim() === "" ? null : Number(draft.qty.value);
  if (quantity === null) bad(draft.qty, "Enter a quantity.");
  else if (quantity < 1) bad(draft.qty, "Quantity must be 1 or more.");
  else if (quantity > MAX_QTY) bad(draft.qty, "Quantity cannot be more than 1,000,000.");

  const unitPrice = parseMoney(draft.price.value);
  if (draft.price.value.trim() === "") bad(draft.price, "Enter the price for one.");
  else if (unitPrice === null) bad(draft.price, "Enter a valid price, for example 25.50.");
  else if (unitPrice < 1) bad(draft.price, "Price must be more than 0.");
  else if (unitPrice > MAX_MONEY) bad(draft.price, "That price is too large.");
  else if (quantity && quantity >= 1 && subtotalWithout(editIndex) + quantity * unitPrice > MAX_MONEY) {
    bad(draft.price, "This makes the invoice too large. The limit is GHS 100,000,000.");
  }
  if (firstBad) { firstBad.focus(); return; }

  const item = { description, quantity, unitPrice };
  if (editIndex === null) items.push(item); else items[editIndex] = item;
  dirty = true;
  resetDraft();
  renderItems();
  update();
  draft.select.focus();
}
addBtn.addEventListener("click", addItem);

// ---------- the list of added items ----------
function renderItems() {
  itemsEmpty.hidden = items.length > 0;
  linesEl.hidden = items.length === 0;
  linesEl.replaceChildren(...items.map((it, i) => {
    const qty = el("input", { id: `item-${i}-qty`, inputmode: "numeric", maxlength: "7", value: String(it.quantity),
      "aria-label": `Quantity for ${it.description}`, "data-kind": "whole" });
    const price = el("input", { id: `item-${i}-price`, inputmode: "decimal", maxlength: "13", value: (it.unitPrice / 100).toFixed(2),
      "aria-label": `Price for one of ${it.description}, in GHS`, "data-kind": "money" });
    const amount = el("strong", { class: "item-amount-value", text: formatGHS(it.quantity * it.unitPrice) });
    const sub = (labelText, input) => {
      input.setAttribute("aria-describedby", "err-" + input.id);
      return el("div", { class: "field" }, el("label", { for: input.id, text: labelText }), input,
        el("p", { class: "field-error", id: "err-" + input.id }));
    };
    const editBtn = el("button", { type: "button", class: "secondary small-btn", text: "Edit",
      "aria-label": `Edit ${it.description}` });
    const removeBtn = el("button", { type: "button", class: "secondary small-btn danger", text: "Remove",
      "aria-label": `Remove ${it.description}` });

    // Quantity and price can be changed right here; the totals follow as you type.
    const commit = () => {
      clearError(qty); clearError(price);
      const q = qty.value.trim() === "" ? null : Number(qty.value);
      const p = parseMoney(price.value);
      let ok = true;
      if (q === null) { setError(qty, "Enter a quantity."); ok = false; }
      else if (q < 1) { setError(qty, "Must be 1 or more."); ok = false; }
      else if (q > MAX_QTY) { setError(qty, "Too large."); ok = false; }
      if (price.value.trim() === "" || p === null) { setError(price, "Enter a valid price."); ok = false; }
      else if (p < 1) { setError(price, "Must be more than 0."); ok = false; }
      else if (p > MAX_MONEY) { setError(price, "Too large."); ok = false; }
      if (ok && subtotalWithout(i) + q * p > MAX_MONEY) { setError(price, "Invoice total too large."); ok = false; }
      if (!ok) return;
      it.quantity = q; it.unitPrice = p;
      amount.textContent = formatGHS(q * p);
      dirty = true;
      update();
    };
    const restore = () => { // leaving a box with a typo puts the last good value back
      if (qty.getAttribute("aria-invalid") || price.getAttribute("aria-invalid")) {
        qty.value = String(it.quantity); price.value = (it.unitPrice / 100).toFixed(2);
        clearError(qty); clearError(price);
      } else price.value = (it.unitPrice / 100).toFixed(2);
    };
    for (const input of [qty, price]) {
      input.addEventListener("input", commit);
      input.addEventListener("change", restore);
    }
    editBtn.addEventListener("click", () => startEdit(i));
    removeBtn.addEventListener("click", () => removeItem(i));

    return el("li", { class: "item" + (editIndex === i ? " is-editing" : "") },
      el("p", { class: "item-name", text: it.description }),
      el("div", { class: "item-fields" }, sub("Quantity", qty), sub("Price for one (GHS)", price)),
      el("p", { class: "item-amount" }, el("span", { class: "small", text: "Amount" }), amount),
      el("div", { class: "item-buttons" }, editBtn, removeBtn));
  }));
}

function removeItem(i) {
  if (editIndex !== null) resetDraft();
  const [removed] = items.splice(i, 1);
  dirty = true;
  renderItems();
  update();
  const next = linesEl.querySelectorAll(".item-buttons .danger")[i] ?? draft.select;
  next.focus();
  const shortName = removed.description.length > 40 ? removed.description.slice(0, 40) + "..." : removed.description;
  toast(`Removed “${shortName}”.`, {
    action: { label: "Undo", onClick: () => { items.splice(i, 0, removed); dirty = true; renderItems(); update(); } },
  });
}

// ---------- read the form ----------
// Checks the discount and deposit boxes (messages appear under them) and gathers everything else.
function readAmount(input, parse, tooBig) {
  clearError(input);
  const value = parse(input.value);
  if (value === null) {
    setError(input, tooBig ? "Enter a percentage from 0 to 100, for example 7.5." : "Enter a valid amount, for example 50 or 50.00.");
    return null;
  }
  if (!tooBig && value > MAX_MONEY) { setError(input, "That amount is too large."); return null; }
  return value;
}

function readForm() {
  const data = new FormData(form);
  const discountType = data.get("discountType");
  const percent = discountType === "percent";
  const discountValue = readAmount(f.discountValue, percent ? parsePercent : parseMoney, percent);
  const deposit = readAmount(f.deposit, parseMoney, false);
  return {
    invalid: discountValue === null || deposit === null,
    values: {
      clientName: data.get("clientName").trim(),
      clientPhone: data.get("clientPhone").trim(),
      eventDate: data.get("eventDate"),
      venue: data.get("venue").trim(),
      invoiceDate: data.get("invoiceDate"),
      notes: data.get("notes").trim(),
      dishes: data.getAll("dish"),
      lines: items.map((i) => ({ ...i })), discountType,
      discountValue: discountValue ?? 0,
      deposit: deposit ?? 0,
    },
  };
}

const niceDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// A balance below zero is never shown: a deposit larger than the total is flagged as an error instead.
const shownBalance = (t) => formatGHS(Math.max(0, t.balance));

// ---------- draw the invoice ----------
function renderInvoice(v, t) {
  const picked = (group) => v.dishes.filter((d) => MENU[group].includes(d));
  const dishLine = (title, list) => list.length
    ? [el("h4", { text: title }), el("p", { text: list.join(", ") })] : [];
  const menuLists = [
    ...dishLine("Starters", picked("starters")), ...dishLine("Rice dishes", picked("rice")),
    ...dishLine("Local dishes", picked("local")), ...dishLine("Desserts", picked("desserts")),
  ];

  const sumRow = (label, value, cls = "sum") =>
    el("tr", { class: cls }, el("td", { colspan: 3, text: label }), el("td", { class: "num", text: value }));

  const showSubtotal = t.discount > 0;
  const discountLabel = v.discountType === "percent" ? `Discount (${formatPercent(v.discountValue)})` : "Discount";

  const table = el("table", {},
    el("thead", {}, el("tr", {},
      el("th", { text: "Item" }), el("th", { class: "num", text: "Qty" }),
      el("th", { class: "num", text: "Price" }), el("th", { class: "num", text: "Amount" }))),
    el("tbody", {},
      ...(t.lines.length
        ? t.lines.map((l) => el("tr", { class: "line" }, el("td", { class: "desc", text: l.description }),
          el("td", { class: "num", "data-label": "Qty", text: String(l.quantity) }),
          el("td", { class: "num", "data-label": "Price", text: formatGHS(l.unitPrice) }),
          el("td", { class: "num", "data-label": "Amount", text: formatGHS(l.amount) })))
        : [el("tr", { class: "empty-row" }, el("td", { colspan: 4, text: "No items added yet." }))]),
      showSubtotal ? sumRow("Subtotal", formatGHS(t.subtotal), "sum first-sum") : null,
      t.discount ? sumRow(discountLabel, "- " + formatGHS(t.discount)) : null,
      sumRow("Total", formatGHS(t.total), showSubtotal ? "sum total-row" : "sum first-sum total-row"),
      t.deposit ? sumRow("Deposit paid", "- " + formatGHS(t.deposit)) : null));

  // Sections left out come through as null: drop them, otherwise the page would print the word "null".
  invoiceEl.replaceChildren(...[
    el("header", { class: "inv-head" },
      el("div", {},
        logoEl,
        el("p", { class: "inv-contact", text: "Madina, Maye Hot" }),
        el("p", { class: "inv-contact", text: "0546155309 / 0509865006" }),
        el("p", { class: "inv-contact", text: "gborglahmawufemor@gmail.com" })),
      el("div", { class: "inv-meta" },
        el("h2", { text: "Invoice" }),
        state.number ? el("p", { class: "inv-number", text: state.number }) : null,
        v.invoiceDate ? el("p", { text: "Date: " + niceDate(v.invoiceDate) }) : null,
        state.status === "paid" ? el("p", { class: "paid stamp", text: "Paid" }) : null)),
    el("section", { class: "inv-parties" },
      el("div", {}, el("h3", { text: "Bill to" }),
        v.clientName ? el("p", { class: "party-name", text: v.clientName }) : el("p", { class: "blank", text: "Client name" }),
        v.clientPhone ? el("p", { text: v.clientPhone }) : null),
      el("div", {}, el("h3", { text: "Event" }),
        v.eventDate ? el("p", { text: niceDate(v.eventDate) }) : null,
        v.venue ? el("p", { text: v.venue }) : null,
        !v.eventDate && !v.venue ? el("p", { class: "blank", text: "Event details" }) : null)),
    table,
    el("div", { class: "balance" },
      el("span", { class: "label", text: "Balance due" }),
      el("span", { class: "amount", text: shownBalance(t) })),
    menuLists.length ? el("section", { class: "included" }, el("h3", { text: "Menu" }), ...menuLists) : null,
    v.notes ? el("section", { class: "included" }, el("h3", { text: "Notes" }), el("p", { text: v.notes })) : null,
    el("section", { class: "pay" },
      el("div", {}, el("h3", { text: "Pay by bank transfer" }),
        el("p", { text: "Fidelity Bank, Madina Branch" }),
        el("p", { text: "Mawufemor Afi Gborglah" }),
        el("p", { text: "Account 2030453360411" })),
      el("div", {}, el("h3", { text: "Pay by mobile money" }),
        el("p", { text: "0546155309" }),
        el("p", { text: "Mawufemor Afi Gborglah" }))),
    el("section", { class: "signatures" },
      el("div", { class: "sig" }, el("div", { class: "sig-line" }),
        el("p", { text: "Client signature" }),
        v.clientName ? el("p", { class: "sig-name", text: v.clientName }) : null),
      el("div", { class: "sig" }, el("div", { class: "sig-line" }),
        el("p", { text: "For Martha's Cuisines" }))),
    el("p", { class: "thanks", text: "Thank you for choosing Martha's Cuisines." }),
  ].filter((section) => section !== null));
}

// The small totals box in the form, so the numbers are visible while editing (not only in the preview).
const sum = (id) => document.querySelector("#" + id);
function renderSummary(v, t) {
  sum("sum-subtotal").textContent = formatGHS(t.subtotal);
  sum("sum-discount-row").hidden = !t.discount;
  sum("sum-discount").textContent = "- " + formatGHS(t.discount);
  sum("sum-total").textContent = formatGHS(t.total);
  sum("sum-deposit-row").hidden = !t.deposit;
  sum("sum-deposit").textContent = "- " + formatGHS(t.deposit);
  sum("sum-balance").textContent = shownBalance(t);
}

// ---------- one function runs on every change ----------
let depositTooBig = false;
function update() {
  const { values } = readForm();
  let totals;
  try {
    totals = calculateTotals(values);
  } catch (err) {
    return;
  }
  // The calculation only warns; here the same warnings are shown under the right box.
  depositTooBig = false;
  if (!f.discountValue.getAttribute("aria-invalid") && totals.warnings.some((w) => w.startsWith("Discount"))) {
    setWarning(f.discountValue, `The discount is bigger than the subtotal, so it is limited to ${formatGHS(totals.discount)}.`);
  }
  if (!f.deposit.getAttribute("aria-invalid") && values.lines.length && values.deposit > totals.total) {
    depositTooBig = true;
    setError(f.deposit, `The deposit is more than the invoice total of ${formatGHS(totals.total)}.`);
  }
  barBalance.textContent = shownBalance(totals);
  syncWhatsapp();
  renderSummary(values, totals);
  renderInvoice(values, totals);
}

// ---------- save and load ----------
function showView(view) {
  appEl.dataset.view = view;
  viewButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
}

// Marks every problem that stops the invoice from being saved or printed. Returns the first box to focus, or null.
function checkReady(action) {
  const { values, invalid } = readForm();
  update();
  let first = null;
  const mark = (input, message) => { if (message) setError(input, message); first ??= input; };
  if (!values.clientName) mark(f.clientName, "Enter the client's name.");
  if (!values.lines.length) {
    itemsNote.textContent = `Add at least one item before ${action}.`;
    first ??= draft.select;
  }
  if (draftHasContent()) {
    draftNote.textContent = "This item has not been added yet. Press “Add item” to include it, or clear the boxes.";
    first ??= addBtn;
  }
  if (invalid) first ??= f.discountValue.getAttribute("aria-invalid") ? f.discountValue : f.deposit;
  if (depositTooBig) first ??= f.deposit;
  return first ? { first } : { values };
}

async function save() {
  notices.textContent = "";
  const check = checkReady("saving");
  if (check.first) {
    showView("edit");
    notices.textContent = "Please fix the highlighted fields, then save again.";
    check.first.focus();
    return;
  }
  await withLoading(saveBtn, "Saving...", async () => {
    try {
      const saved = await api(state.id ? `/invoices/${state.id}` : "/invoices", {
        method: state.id ? "PUT" : "POST",
        body: check.values, // totals are not sent: the server works them out itself
      });
      state.id = saved.id; state.number = saved.number; state.status = saved.status;
      history.replaceState(null, "", "/?id=" + saved.id);
      document.querySelector("#form-title").textContent = "Invoice " + saved.number;
      update();
      barBalance.textContent = formatGHS(Math.max(0, saved.balance)); // the server's saved figure wins
      dirty = false;
      toast("Invoice " + saved.number + " saved.");
    } catch (err) {
      notices.textContent = err.message + ".";
      toast("Could not save: " + err.message + ".", { type: "error" });
    }
  });
}

const plain = (n) => String(Number(n.toFixed(2))); // 750 / 100 -> "7.5"

function fillForm(inv) {
  f.clientName.value = inv.clientName; f.clientPhone.value = inv.clientPhone;
  f.eventDate.value = inv.eventDate; f.venue.value = inv.venue;
  f.invoiceDate.value = inv.invoiceDate; f.notes.value = inv.notes;
  f.discountType.value = inv.discountType;
  f.discountValue.value = !inv.discountValue ? ""
    : inv.discountType === "percent" ? plain(inv.discountValue / 100) : (inv.discountValue / 100).toFixed(2);
  f.deposit.value = inv.deposit ? (inv.deposit / 100).toFixed(2) : "";
  form.querySelectorAll('input[name="dish"]').forEach((box) => { box.checked = inv.dishes.includes(box.value); });
  items = inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }));
  resetDraft();
  renderItems();
  state.id = inv.id; state.number = inv.number; state.status = inv.status;
  document.querySelector("#form-title").textContent = "Invoice " + inv.number;
}

// ---------- print / save as PDF ----------
printBtn.addEventListener("click", () => {
  notices.textContent = "";
  const check = checkReady("printing");
  if (check.first) {
    showView("edit");
    notices.textContent = "Please fix the highlighted fields before printing.";
    check.first.focus();
    return;
  }
  toast("Opening the print window. Choose “Save as PDF” to download a copy.", { duration: 4500 });
  setTimeout(() => window.print(), 150); // lets the message appear first
});
// The browser uses the page title as the PDF file name.
const pageTitle = document.title;
window.addEventListener("beforeprint", () => {
  const name = f.clientName.value.trim();
  document.title = [state.number ? "Invoice " + state.number : "Invoice", name].filter(Boolean).join(" - ");
});
window.addEventListener("afterprint", () => { document.title = pageTitle; });

// ---------- WhatsApp ----------
// WhatsApp links cannot attach files: she saves the PDF, then attaches it in the chat that opens.
const whatsappBtn = document.querySelector("#whatsapp");
function syncWhatsapp() {
  // Not truly disabled, so that tapping it can explain what to do first.
  whatsappBtn.setAttribute("aria-disabled", String(!state.id));
  whatsappBtn.classList.toggle("is-off", !state.id);
  whatsappBtn.title = state.id ? "Opens WhatsApp with a message ready. Attach the PDF there." : "Save the invoice first";
}
whatsappBtn.addEventListener("click", () => {
  if (!state.id) { toast("Save the invoice before sending it on WhatsApp.", { type: "error" }); return; }
  const { values } = readForm();
  const t = calculateTotals(values);
  const url = whatsappLink({
    phone: values.clientPhone, clientName: values.clientName || "there",
    number: state.number, balanceText: formatGHS(t.balance),
  });
  window.open(url, "_blank", "noopener");
  toast("WhatsApp opened. Attach the saved PDF in the chat.");
});

// ---------- phone layout: one pane at a time ----------
const appEl = document.querySelector(".app");
const viewButtons = document.querySelectorAll(".view-switch button");
viewButtons.forEach((btn) => btn.addEventListener("click", () => {
  showView(btn.dataset.view);
  window.scrollTo(0, 0);
}));

// ---------- keyboard: Enter moves on, or adds the item ----------
const fillable = () => [...form.querySelectorAll("input:not([type=checkbox]), select, textarea")]
  .filter((x) => !x.disabled && x.offsetParent !== null);
function focusNext(current) {
  const all = fillable();
  const next = all[all.indexOf(current) + 1];
  (next ?? saveBtn).focus();
}
form.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.key === "Escape" && editIndex !== null && t.closest("#draft")) { resetDraft(); draft.select.focus(); return; }
  if (e.key !== "Enter" || e.isComposing) return;
  if (t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.type === "checkbox") return;
  e.preventDefault(); // Enter must never reload the page or submit the form
  if (t === draft.price) addItem();
  else if (t === draft.select && !draft.select.value) return;
  else focusNext(t);
});

// ---------- the rest of the form ----------
// Warn before leaving the page with changes that have not been saved.
window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });
form.addEventListener("input", (e) => {
  if (e.target.closest("#draft, #lines")) return; // those boxes handle themselves
  dirty = true; notices.textContent = "";
  if (e.target === f.clientName) clearError(f.clientName);
  update();
});
f.discountType.addEventListener("change", () => { dirty = true; update(); });
form.addEventListener("submit", (e) => e.preventDefault());
saveBtn.addEventListener("click", save);
wireLogout();

f.invoiceDate.value = localToday();
renderItems();
update();

const editId = new URLSearchParams(location.search).get("id");
if (editId) {
  const title = document.querySelector("#form-title");
  title.textContent = "Loading invoice...";
  form.setAttribute("aria-busy", "true");
  api("/invoices/" + encodeURIComponent(editId))
    .then((inv) => { fillForm(inv); update(); })
    .catch((err) => {
      title.textContent = "New invoice";
      notices.textContent = "Could not open that invoice: " + err.message + ".";
      toast("Could not open that invoice: " + err.message + ".", { type: "error" });
    })
    .finally(() => form.removeAttribute("aria-busy"));
} else if (window.matchMedia("(pointer: fine)").matches) {
  f.clientName.focus(); // on a phone this would pop the keyboard open, so only on a computer
}
