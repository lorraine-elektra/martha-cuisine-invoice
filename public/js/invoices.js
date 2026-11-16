import { api, wireLogout } from "/js/api.js";
import { formatGHS } from "/src/money.js";

const list = document.querySelector("#list");
const msg = document.querySelector("#msg");
const search = document.querySelector("#q");
wireLogout();

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

const niceDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function load() {
  msg.textContent = "";
  let invoices;
  try {
    invoices = await api("/invoices?q=" + encodeURIComponent(search.value.trim()));
  } catch (err) {
    msg.textContent = err.message + ".";
    return;
  }
  if (!invoices.length) {
    list.replaceChildren(el("li", { class: "empty", text: search.value.trim() ? "No invoices match your search." : "There are no invoices yet. Select New invoice to create the first one." }));
    return;
  }
  list.replaceChildren(...invoices.map((inv) => {
    const paid = inv.status === "paid";
    const toggle = el("button", {
      type: "button", class: "secondary", text: paid ? "Mark unpaid" : "Mark paid",
      "aria-label": `${paid ? "Mark unpaid" : "Mark paid"}: ${inv.number}, ${inv.clientName}`,
    });
    toggle.addEventListener("click", async () => {
      if (paid && !confirm(`Mark invoice ${inv.number} as unpaid?`)) return;
      toggle.disabled = true;
      try { await api(`/invoices/${inv.id}/paid`, { method: "POST", body: { paid: !paid } }); load(); }
      catch (err) { msg.textContent = err.message + "."; toggle.disabled = false; }
    });
    return el("li", { class: "inv-item" },
      el("a", { class: "inv-main", href: "/?id=" + inv.id },
        el("strong", { text: inv.number }),
        el("span", { text: inv.clientName }),
        inv.eventDate ? el("span", { class: "small", text: niceDate(inv.eventDate) }) : null),
      el("div", { class: "inv-side" },
        el("span", { class: "balance-cell" }, el("span", { class: "small", text: "Balance due" }),
          el("strong", { text: formatGHS(inv.balance) })),
        el("span", { class: paid ? "status paid" : "status", text: paid ? "Paid" : "Unpaid" }),
        toggle));
  }));
}

let timer;
search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250); });
load();
