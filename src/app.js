import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuth } from "./auth.js";
import { checkInvoiceInput, ValidationError } from "./invoices.js";
import { createInvoice, updateInvoice, getInvoice, listInvoices, setPaid } from "./db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Only these source files are safe and needed in the browser.
const BROWSER_FILES = new Set(["money.js", "totals.js", "packages.js", "menu.js", "whatsapp.js"]);

export function createApp({ db, password, secret, trustProxy = false }) {
  const app = express();
  const auth = createAuth({ password, secret });
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
  api.put("/invoices/:id", (req, res) => {
    const { values, totals } = checkInvoiceInput(req.body);
    const inv = idOf(req) && updateInvoice(db, idOf(req), values, totals);
    inv ? res.json(inv) : res.status(404).json({ error: "Invoice not found" });
  });
  api.post("/invoices/:id/paid", (req, res) => {
    const inv = idOf(req) && setPaid(db, idOf(req), req.body?.paid !== false);
    inv ? res.json(inv) : res.status(404).json({ error: "Invoice not found" });
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
