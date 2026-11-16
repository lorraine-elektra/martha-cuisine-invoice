import { calculateTotals } from "/src/totals.js";
import { cedisToPesewas, percentToBp, formatGHS, formatPercent } from "/src/money.js";
import { MENU, ITEM_SUGGESTIONS } from "/src/menu.js";
import { api, wireLogout } from "/js/api.js";
import { whatsappLink } from "/src/whatsapp.js";

// The saved invoice this screen is showing. id and number are null until the first save.
const state = { id: null, number: null, status: "unpaid" };

const form = document.querySelector("#builder");
const invoiceEl = document.querySelector("#invoice");
const notices = document.querySelector("#notices");
const barBalance = document.querySelector("#bar-balance");
const linesEl = document.querySelector("#lines");
const saveBtn = document.querySelector("#save");

// ---------- tiny helper: build elements safely (text only, never raw HTML) ----------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

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

// ---------- item rows: description, quantity, price ----------
const OTHER = "__other__";
const itemGroups = [
  ["Packages and charges", ITEM_SUGGESTIONS.filter((n) => !MENU.extras.includes(n))],
  ["Starters", MENU.starters], ["Rice dishes", MENU.rice], ["Local dishes", MENU.local],
  ["Extras", MENU.extras], ["Desserts", MENU.desserts],
];
const allItemNames = itemGroups.flatMap(([, names]) => names);

function itemSelect(current) {
  const known = allItemNames.includes(current);
  const select = el("select", { class: "line-select" },
    el("option", { value: "", text: "Choose an item..." }),
    ...itemGroups.map(([label, names]) =>
      el("optgroup", { label }, ...names.map((n) => el("option", { value: n, text: n })))),
    el("option", { value: OTHER, text: "Other (type my own)" }));
  select.value = known ? current : current ? OTHER : "";
  return select;
}

function addLine(line = {}) {
  const description = line.description ?? "";
  const select = itemSelect(description);
  const descInput = el("input", { class: "line-desc", "aria-label": "Item name", placeholder: "Type the item name", value: description });
  descInput.hidden = select.value !== OTHER;
  select.addEventListener("change", () => {
    if (select.value === OTHER) { descInput.hidden = false; descInput.value = ""; descInput.focus(); }
    else { descInput.hidden = true; descInput.value = select.value; }
    update();
  });
  const row = el("div", { class: "line-row" },
    el("label", { class: "line-field line-desc-field" }, "Package or item", select, descInput),
    el("label", { class: "line-field line-qty-field" }, "Quantity",
      el("input", { class: "line-qty", inputmode: "numeric", value: line.quantity ?? "" })),
    el("label", { class: "line-field line-price-field" }, "Price for one (GHS)",
      el("input", { class: "line-price", inputmode: "decimal",
        value: line.unitPrice === undefined ? "" : (line.unitPrice / 100).toFixed(2) })),
    el("button", { type: "button", class: "secondary", text: "Remove" }));
  row.querySelector("button").addEventListener("click", () => { row.remove(); dirty = true; update(); });
  linesEl.append(row);
}
document.querySelector("#add-line").addEventListener("click", () => {
  addLine();
  linesEl.lastElementChild.querySelector("select").focus();
});

// ---------- read the form ----------
// Each reader returns the value, or null for a typo (and marks the box). Empty means 0.
function readWith(input, parse) {
  const raw = input.value.trim();
  input.removeAttribute("aria-invalid");
  if (raw === "") return 0;
  try { return parse(raw); } catch { input.setAttribute("aria-invalid", "true"); return null; }
}
const readMoney = (input) => readWith(input, cedisToPesewas);
const readPercent = (input) => readWith(input, percentToBp);
const readWhole = (input) => readWith(input, (raw) => {
  if (!/^\d+$/.test(raw)) throw new Error("not whole");
  return Number(raw);
});

function readForm() {
  const data = new FormData(form);
  const problems = [];

  const lines = [];
  [...linesEl.querySelectorAll(".line-row")].forEach((row, i) => {
    const description = row.querySelector(".line-desc").value.trim();
    const qtyInput = row.querySelector(".line-qty");
    const priceInput = row.querySelector(".line-price");
    const quantity = readWhole(qtyInput);
    const unitPrice = readMoney(priceInput);
    const untouched = !description && !qtyInput.value.trim() && !priceInput.value.trim();
    if (untouched) return; // a blank row is ignored
    const n = i + 1;
    // An item only counts once it has a name, a quantity and a price together.
    // Incomplete rows are reported and kept off the invoice.
    let complete = true;
    const select = row.querySelector("select");
    const descBox = select.value === OTHER ? row.querySelector(".line-desc") : select;
    descBox.removeAttribute("aria-invalid");
    const flag = (input, message) => { problems.push(`Item ${n} ${message}`); input.setAttribute("aria-invalid", "true"); complete = false; };
    if (!description) flag(descBox, "needs a name");
    if (quantity === null) flag(qtyInput, "needs a whole number as its quantity");
    else if (quantity < 1) flag(qtyInput, "needs a quantity of 1 or more");
    if (unitPrice === null) flag(priceInput, "needs a valid price, for example 25.50");
    else if (unitPrice < 1) flag(priceInput, "needs a price");
    if (complete) lines.push({ description, quantity, unitPrice });
  });

  const discountType = data.get("discountType");
  const discountValue = (discountType === "percent" ? readPercent : readMoney)(form.elements.discountValue);
  const deposit = readMoney(form.elements.deposit);
  if (discountValue === null) problems.push("The discount is not valid");
  if (deposit === null) problems.push("The deposit is not a valid amount");

  return {
    problems,
    values: {
      clientName: data.get("clientName").trim(),
      clientPhone: data.get("clientPhone").trim(),
      eventDate: data.get("eventDate"),
      venue: data.get("venue").trim(),
      invoiceDate: data.get("invoiceDate"),
      notes: data.get("notes").trim(),
      dishes: data.getAll("dish"),
      lines, discountType,
      discountValue: discountValue ?? 0,
      deposit: deposit ?? 0,
    },
  };
}

const niceDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

// ---------- draw the invoice ----------
function renderInvoice(v, t) {
  const picked = (group) => v.dishes.filter((d) => MENU[group].includes(d));
  const dishLine = (title, list) => list.length
    ? [el("h4", { text: title }), el("p", { text: list.join(", ") })] : [];
  const menuLists = [
    ...dishLine("Starters", picked("starters")), ...dishLine("Rice dishes", picked("rice")),
    ...dishLine("Local dishes", picked("local")), ...dishLine("Desserts", picked("desserts")),
  ];

  const sumRow = (label, value) =>
    el("tr", { class: "sum" }, el("td", { colspan: 3, text: label }), el("td", { class: "num", text: value }));

  const showSubtotal = t.discount > 0;
  const discountLabel = v.discountType === "percent" ? `Discount (${formatPercent(v.discountValue)})` : "Discount";

  const table = el("table", {},
    el("thead", {}, el("tr", {},
      el("th", { text: "Item" }), el("th", { class: "num", text: "Qty" }),
      el("th", { class: "num", text: "Price" }), el("th", { class: "num", text: "Amount" }))),
    el("tbody", {},
      ...t.lines.map((l) => el("tr", {}, el("td", { text: l.description }),
        el("td", { class: "num", text: String(l.quantity) }),
        el("td", { class: "num", text: formatGHS(l.unitPrice) }),
        el("td", { class: "num", text: formatGHS(l.amount) }))),
      showSubtotal ? sumRow("Subtotal", formatGHS(t.subtotal)) : null,
      t.discount ? sumRow(discountLabel, "- " + formatGHS(t.discount)) : null,
      sumRow("Total", formatGHS(t.total)),
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
        state.number ? el("p", { text: state.number }) : null,
        v.invoiceDate ? el("p", { text: "Date: " + niceDate(v.invoiceDate) }) : null,
        state.status === "paid" ? el("p", { class: "paid", text: "Paid" }) : null)),
    // Each block appears only once something has been typed into it.
    (v.clientName || v.clientPhone || v.eventDate || v.venue) ? el("section", { class: "inv-parties" },
      (v.clientName || v.clientPhone) ? el("div", {}, el("h3", { text: "Bill to" }),
        v.clientName ? el("p", { text: v.clientName }) : null,
        v.clientPhone ? el("p", { text: v.clientPhone }) : null) : null,
      (v.eventDate || v.venue) ? el("div", {}, el("h3", { text: "Event" }),
        v.eventDate ? el("p", { text: niceDate(v.eventDate) }) : null,
        v.venue ? el("p", { text: v.venue }) : null) : null) : null,
    table,
    menuLists.length ? el("section", { class: "included" }, el("h3", { text: "Menu" }), ...menuLists) : null,
    v.notes ? el("section", { class: "included" }, el("h3", { text: "Notes" }), el("p", { text: v.notes })) : null,
    el("div", { class: "balance" },
      el("span", { class: "label", text: "Balance due" }),
      el("span", { class: "amount", text: formatGHS(t.balance) })),
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

// Joins messages into one sentence-style notice that ends with a full stop.
const sentence = (messages) => messages.length ? messages.join(". ").replace(/\.?$/, ".") : "";

// ---------- one function runs on every change ----------
function update() {
  const { problems, values } = readForm();
  let totals;
  try {
    totals = calculateTotals(values);
  } catch (err) {
    notices.textContent = sentence([err.message]);
    return;
  }
  notices.textContent = sentence([...problems, ...totals.warnings]);
  barBalance.textContent = formatGHS(totals.balance);
  syncWhatsapp();
  renderInvoice(values, totals);
}

// ---------- save and load ----------
async function save() {
  const { problems, values } = readForm();
  if (!values.clientName) {
    form.elements.clientName.setAttribute("aria-invalid", "true");
    form.elements.clientName.focus();
    notices.textContent = sentence(["Enter the client's name before saving", ...problems]);
    return;
  }
  if (problems.length) { notices.textContent = sentence(problems); return; }
  if (!values.lines.length) { notices.textContent = "Add at least one item before saving."; return; }
  saveBtn.disabled = true;
  try {
    const saved = await api(state.id ? `/invoices/${state.id}` : "/invoices", {
      method: state.id ? "PUT" : "POST",
      body: values, // totals are not sent: the server works them out itself
    });
    state.id = saved.id; state.number = saved.number; state.status = saved.status;
    history.replaceState(null, "", "/?id=" + saved.id);
    document.querySelector("#form-title").textContent = "Invoice " + saved.number;
    update();
    barBalance.textContent = formatGHS(saved.balance); // the server's saved figure wins
    dirty = false;
    flash("Invoice " + saved.number + " saved.");
  } catch (err) {
    notices.textContent = sentence([err.message]);
  } finally {
    saveBtn.disabled = false;
  }
}

function flash(message) {
  document.querySelector("#flash")?.remove();
  const note = el("p", { id: "flash", class: "flash", role: "status", text: message });
  document.body.append(note);
  setTimeout(() => note.remove(), 3000);
}

const plain = (n) => String(Number(n.toFixed(2))); // 750 / 100 -> "7.5"

function fillForm(inv) {
  const f = form.elements;
  f.clientName.value = inv.clientName; f.clientPhone.value = inv.clientPhone;
  f.eventDate.value = inv.eventDate; f.venue.value = inv.venue;
  f.invoiceDate.value = inv.invoiceDate; f.notes.value = inv.notes;
  f.discountType.value = inv.discountType;
  f.discountValue.value = !inv.discountValue ? ""
    : inv.discountType === "percent" ? plain(inv.discountValue / 100) : (inv.discountValue / 100).toFixed(2);
  f.deposit.value = inv.deposit ? (inv.deposit / 100).toFixed(2) : "";
  form.querySelectorAll('input[name="dish"]').forEach((box) => { box.checked = inv.dishes.includes(box.value); });
  linesEl.replaceChildren();
  inv.lines.forEach(addLine);
  if (!inv.lines.length) addLine();
  state.id = inv.id; state.number = inv.number; state.status = inv.status;
  document.querySelector("#form-title").textContent = "Invoice " + inv.number;
}

// WhatsApp links cannot attach files: she saves the PDF, then attaches it in the chat that opens.
const whatsappBtn = document.querySelector("#whatsapp");
function syncWhatsapp() {
  // Not truly disabled, so that tapping it can explain what to do first.
  whatsappBtn.setAttribute("aria-disabled", String(!state.id));
  whatsappBtn.classList.toggle("is-off", !state.id);
  whatsappBtn.title = state.id ? "Opens WhatsApp with a message ready. Attach the PDF there." : "Save the invoice first";
}
whatsappBtn.addEventListener("click", () => {
  if (!state.id) { notices.textContent = "Save the invoice before sending it on WhatsApp."; return; }
  const { values } = readForm();
  const t = calculateTotals(values);
  const url = whatsappLink({
    phone: values.clientPhone, clientName: values.clientName || "there",
    number: state.number, balanceText: formatGHS(t.balance),
  });
  window.open(url, "_blank", "noopener");
});

// Phone layout: one pane at a time. Edit the invoice, or look at the finished page.
const appEl = document.querySelector(".app");
const viewButtons = document.querySelectorAll(".view-switch button");
viewButtons.forEach((btn) => btn.addEventListener("click", () => {
  appEl.dataset.view = btn.dataset.view;
  viewButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  window.scrollTo(0, 0);
}));

// Warn before leaving the page with changes that have not been saved.
let dirty = false;
window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });
form.addEventListener("input", () => { dirty = true; update(); });
form.elements.clientName.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));
form.addEventListener("submit", (e) => e.preventDefault()); // Enter in a box must not reload the page
document.querySelector("#print").addEventListener("click", () => window.print());
document.querySelector("#save").addEventListener("click", save);
wireLogout();

form.elements.invoiceDate.value = new Date().toISOString().slice(0, 10);
addLine();
update();

const editId = new URLSearchParams(location.search).get("id");
if (editId) {
  api("/invoices/" + encodeURIComponent(editId))
    .then((inv) => { fillForm(inv); update(); })
    .catch((err) => { notices.textContent = sentence([err.message]); });
}
