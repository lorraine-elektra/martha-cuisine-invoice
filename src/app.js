import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuth } from "./auth.js";
import { checkInvoiceInput, ValidationError } from "./invoices.js";
import { createInvoice, updateInvoice, getInvoice, listInvoices, markPaid, addPaymentMethod } from "./db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Only these source files are safe and needed in the browser.
const BROWSER_FILES = new Set(["money.js", "totals.js", "menu.js", "whatsapp.js"]);

export function createApp({ db, pin, secret, trustProxy = false }) {
  const app = express();
  const auth = createAuth({ pin, secret });
  // Behind a host's HTTPS proxy, trust it so cookies are marked secure and login limits see the real IP.
  if (trustProxy) app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    next();
  });

  app.post("/api/login", auth.login);
  app.post("/api/logout", auth.logout);

  const api = express.Router();
  api.use(auth.requireLogin);

  const idOf = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  api.get("/session", (req, res) => res.json({ ok: true })); // lets the page keep a busy session alive
  api.get("/invoices", (req, res) => {
    res.json(listInvoices(db, typeof req.query.q === "string" ? req.query.q.slice(0, 100) : ""));
  });
  api.get("/invoices/:id", (req, res) => {
    const inv = idOf(req) && getInvoice(db, idOf(req));
    inv ? res.json(inv) : res.status(404).json({ error: "Invoice not found" });
  });
  api.post("/invoices", (req, res) => {
    const { values, totals } = checkInvoiceInput(req.body);
    res.status(201).json(createInvoice(db, values, totals));
  });
  // A paid invoice is a finished record. Nothing below may change it, whatever the browser sends.
  const locked = (res) => res.status(409).json({ error: "This invoice has been paid and can no longer be changed" });

  api.put("/invoices/:id", (req, res) => {
    const id = idOf(req);
    const existing = id && getInvoice(db, id);
    if (!existing) return res.status(404).json({ error: "Invoice not found" });
    if (existing.status === "paid") return locked(res);
    const { values, totals } = checkInvoiceInput(req.body);
    const inv = updateInvoice(db, id, values, totals); // null if it was paid in the meantime
    inv ? res.json(inv) : locked(res);
  });
  // Marking paid locks the invoice for good, so it needs the PIN as well as the login.
  api.post("/invoices/:id/paid", auth.requirePin, (req, res) => {
    const id = idOf(req);
    const existing = id && getInvoice(db, id);
    if (!existing) return res.status(404).json({ error: "Invoice not found" });
    if (req.body?.paid === false) {
      return res.status(409).json({ error: existing.status === "paid"
        ? "A paid invoice cannot be marked as unpaid" : "This invoice is not paid" });
    }
    const method = req.body?.method;
    if (!["cash", "momo", "bank"].includes(method)) {
      return res.status(400).json({ error: "Choose how it was paid: cash, MoMo or bank" });
    }
    // Already paid: the only thing still allowed is recording the method on an old invoice that has none.
    if (existing.status === "paid" && existing.paymentMethod) return locked(res);
    const inv = existing.status === "paid" ? addPaymentMethod(db, id, method) : markPaid(db, id, method);
    inv ? res.json(inv) : locked(res);
  });
  app.use("/api", api);

  app.use("/src", (req, res, next) => {
    const name = req.path.slice(1);
    if (!BROWSER_FILES.has(name)) return res.status(404).end();
    res.sendFile(path.join(root, "src", name));
  });
  app.use(express.static(path.join(root, "public")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid request" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}
