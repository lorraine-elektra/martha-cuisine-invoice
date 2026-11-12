import { calculateTotals } from "/src/totals.js";
import { cedisToPesewas, formatGHS } from "/src/money.js";
import { PACKAGES } from "/src/packages.js";
import { MENU, PACKAGE_INCLUDES } from "/src/menu.js";
import { api, wireLogout } from "/js/api.js";
import { whatsappLink } from "/src/whatsapp.js";

// The saved invoice this screen is showing. id and number are null until the first save.
const state = { id: null, number: null, status: "unpaid" };

const form = document.querySelector("#builder");
const invoiceEl = document.querySelector("#invoice");
const notices = document.querySelector("#notices");
const barBalance = document.querySelector("#bar-balance");

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

// ---------- build the dish checkboxes and the first extras row ----------
const dishGroups = [
  ["Starters", "starters"], ["Desserts", "desserts"], ["Rice dishes", "rice"], ["Local dishes", "local"],
];
const dishesEl = document.querySelector("#dishes");
for (const [title, key] of dishGroups) {
  dishesEl.append(
    el("div", { class: "dish-group" }, el("h3", { text: title }),
      ...MENU[key].map((name) =>
        el("label", { class: "dish" },
          el("input", { type: "checkbox", name: "dish", value: name, "data-group": key }), name))),
  );
}

const extrasEl = document.querySelector("#extras");
const datalist = el("datalist", { id: "extra-names" }, ...MENU.extras.map((n) => el("option", { value: n })));
form.append(datalist);

function addExtraRow() {
  const row = el("div", { class: "extra-row" },
    el("input", { class: "extra-name", list: "extra-names", placeholder: "Extra item", "aria-label": "Extra item" }),
    el("input", { class: "extra-amount", inputmode: "decimal", placeholder: "GHS", "aria-label": "Extra amount in cedis" }),
    el("button", { type: "button", class: "secondary", "aria-label": "Remove extra", text: "x" }));
  row.querySelector("button").addEventListener("click", () => { row.remove(); update(); });
  extrasEl.append(row);
}
document.querySelector("#add-extra").addEventListener("click", addExtraRow);

// ---------- read the form ----------
// Empty box means 0. A typo returns null so we can flag the field.
function readMoney(input) {
  const raw = input.value.trim();
  if (raw === "") { input.removeAttribute("aria-invalid"); return 0; }
  try {
    const pesewas = cedisToPesewas(raw);
    input.removeAttribute("aria-invalid");
    return pesewas;
  } catch {
    input.setAttribute("aria-invalid", "true");
    return null;
  }
}

function readForm() {
  const data = new FormData(form);
  const problems = [];
  const discount = readMoney(form.elements.discount);
  const deposit = readMoney(form.elements.deposit);
  if (discount === null) problems.push("Discount is not a valid amount");
  if (deposit === null) problems.push("Deposit is not a valid amount");

  const extras = [];
  for (const row of extrasEl.querySelectorAll(".extra-row")) {
    const name = row.querySelector(".extra-name").value.trim();
    const amountInput = row.querySelector(".extra-amount");
    const amount = readMoney(amountInput);
    if (amount === null) problems.push(`Extra "${name || "item"}" has an invalid amount`);
    else if (name || amount) extras.push({ name: name || "Extra", amount });
  }

  const guests = Number(data.get("guests"));
  if (!Number.isInteger(guests) || guests < 1) problems.push("Guests must be a whole number");

  return {
    problems,
    values: {
      clientName: data.get("clientName").trim(),
      clientPhone: data.get("clientPhone").trim(),
      eventDate: data.get("eventDate"),
      venue: data.get("venue").trim(),
      invoiceDate: data.get("invoiceDate"),
      notes: data.get("notes").trim(),
      packageId: data.get("packageId"),
      guests, extras,
      discount: discount ?? 0,
      deposit: deposit ?? 0,
      dishes: data.getAll("dish"),
    },
  };
}

const niceDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

// ---------- draw the invoice ----------
function renderInvoice(v, t) {
  const pkg = PACKAGES[v.packageId];
  const inc = PACKAGE_INCLUDES[v.packageId];
  const picked = (group) => v.dishes.filter((d) => MENU[group].includes(d));

  const rows = [
    ["Catering: " + pkg.name + " package", String(v.guests), formatGHS(t.ratePerHead), formatGHS(t.packageTotal)],
    ["Set-up charge", "1", formatGHS(t.setupCharge), formatGHS(t.setupCharge)],
    ...v.extras.map((e) => [e.name, "1", formatGHS(e.amount), formatGHS(e.amount)]),
  ];

  const includedBlock = el("section", { class: "included" }, el("h3", { text: "What's included" }));
  const dishLine = (title, list) => list.length
    ? [el("h4", { text: title }), el("p", { text: list.join(", ") })] : [];
  includedBlock.append(
    ...dishLine("Starters", picked("starters")),
    ...dishLine("Rice dishes", picked("rice")),
    ...dishLine("Local dishes", picked("local")),
    ...dishLine("Desserts", picked("desserts")),
    ...dishLine("With every " + pkg.name + " order", inc.fixed),
  );

  const sumRow = (label, value) =>
    el("tr", { class: "sum" }, el("td", { colspan: 3, text: label }), el("td", { class: "num", text: value }));

  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 100 100");
  ring.setAttribute("preserveAspectRatio", "none");
  ring.setAttribute("aria-hidden", "true");
  // pathLength 100 + dasharray leaves a small gap, so the ring stays "open" like the plate in the logo
  ring.innerHTML = '<ellipse cx="50" cy="50" rx="49" ry="49" pathLength="100" stroke-dasharray="92 8" transform="rotate(-60 50 50)"/>';

  const table = el("table", {},
    el("thead", {}, el("tr", {},
      el("th", { text: "Description" }), el("th", { class: "num", text: "Guests / qty" }),
      el("th", { class: "num", text: "Rate" }), el("th", { class: "num", text: "Amount" }))),
    el("tbody", {},
      ...rows.map(([d, q, r, a]) => el("tr", {}, el("td", { text: d }),
        el("td", { class: "num", text: q }), el("td", { class: "num", text: r }), el("td", { class: "num", text: a }))),
      t.discount ? sumRow("Discount", "- " + formatGHS(t.discount)) : null,
      sumRow("Total", formatGHS(t.total)),
      t.deposit ? sumRow("Deposit paid", "- " + formatGHS(t.deposit)) : null));

  invoiceEl.replaceChildren(
    el("header", { class: "inv-head" },
      el("div", {},
        logoEl,
        el("p", { class: "inv-contact", text: "Madina, Maye Hot" }),
        el("p", { class: "inv-contact", text: "0546155309 / 0509865006" }),
        el("p", { class: "inv-contact", text: "gborglahmawufemor@gmail.com" })),
      el("div", { class: "inv-meta" },
        el("h2", { text: "Invoice" }),
        el("p", { text: state.number ?? "Draft" }),
        el("p", { text: "Date: " + niceDate(v.invoiceDate) }),
        state.status === "paid" ? el("p", { class: "paid", text: "Paid" }) : null)),
    el("section", { class: "inv-parties" },
      el("div", {}, el("h3", { text: "Bill to" }),
        el("p", { text: v.clientName || "Client name" }), el("p", { text: v.clientPhone })),
      el("div", {}, el("h3", { text: "Event" }),
        el("p", { text: niceDate(v.eventDate) || "Event date" }), el("p", { text: v.venue }))),
    table,
    includedBlock,
    v.notes ? el("section", { class: "included" }, el("h3", { text: "Notes" }), el("p", { text: v.notes })) : null,
    el("div", { class: "balance" }, ring,
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
    el("p", { class: "thanks", text: "Thank you for choosing Martha's Cuisines." }),
  );
}

// ---------- one function runs on every change ----------
function update() {
  const { problems, values } = readForm();
  let totals;
  try {
    totals = calculateTotals(values);
  } catch (err) {
    notices.textContent = err.message;
    return;
  }
  notices.textContent = [...problems, ...totals.warnings].join(". ");
  barBalance.textContent = formatGHS(totals.balance);
  syncWhatsapp();
  renderInvoice(values, totals);
}

// ---------- save and load ----------
async function save() {
  const { problems, values } = readForm();
  if (problems.length) { notices.textContent = problems.join(". "); return; }
  const saveBtn = document.querySelector("#save");
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
    notices.textContent = ""; // the server's saved total replaces the local one on screen
    barBalance.textContent = formatGHS(saved.balance);
    flash("Saved as " + saved.number);
  } catch (err) {
    notices.textContent = err.message;
  } finally {
    saveBtn.disabled = false;
  }
}

function flash(message) {
  const old = document.querySelector("#flash");
  old?.remove();
  const note = el("p", { id: "flash", class: "flash", role: "status", text: message });
  document.body.append(note);
  setTimeout(() => note.remove(), 3000);
}

function fillForm(inv) {
  const f = form.elements;
  f.clientName.value = inv.clientName; f.clientPhone.value = inv.clientPhone;
  f.eventDate.value = inv.eventDate; f.venue.value = inv.venue;
  f.invoiceDate.value = inv.invoiceDate; f.notes.value = inv.notes;
  f.packageId.value = inv.packageId; f.guests.value = inv.guests;
  f.discount.value = inv.discount ? (inv.discount / 100).toFixed(2) : "";
  f.deposit.value = inv.deposit ? (inv.deposit / 100).toFixed(2) : "";
  form.querySelectorAll('input[name="dish"]').forEach((box) => { box.checked = inv.dishes.includes(box.value); });
  extrasEl.replaceChildren();
  for (const e of inv.extras) {
    addExtraRow();
    const row = extrasEl.lastElementChild;
    row.querySelector(".extra-name").value = e.name;
    row.querySelector(".extra-amount").value = (e.amount / 100).toFixed(2);
  }
  if (!inv.extras.length) addExtraRow();
  state.id = inv.id; state.number = inv.number; state.status = inv.status;
  document.querySelector("#form-title").textContent = "Invoice " + inv.number;
}

// WhatsApp links cannot attach files: she saves the PDF, then attaches it in the chat that opens.
const whatsappBtn = document.querySelector("#whatsapp");
function syncWhatsapp() {
  whatsappBtn.disabled = !state.id;
  whatsappBtn.title = state.id ? "Opens WhatsApp with a message ready. Attach the PDF there." : "Save the invoice first";
}
whatsappBtn.addEventListener("click", () => {
  const { values } = readForm();
  const t = calculateTotals(values);
  const url = whatsappLink({
    phone: values.clientPhone, clientName: values.clientName || "there",
    number: state.number, balanceText: formatGHS(t.balance),
  });
  window.open(url, "_blank", "noopener");
});

form.addEventListener("input", update);
document.querySelector("#print").addEventListener("click", () => window.print());
document.querySelector("#save").addEventListener("click", save);
wireLogout();

form.elements.invoiceDate.value = new Date().toISOString().slice(0, 10);
addExtraRow();
update();

const editId = new URLSearchParams(location.search).get("id");
if (editId) {
  api("/invoices/" + encodeURIComponent(editId))
    .then((inv) => { fillForm(inv); update(); })
    .catch((err) => { notices.textContent = err.message; });
}
