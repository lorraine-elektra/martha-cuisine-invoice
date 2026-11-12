# Build plan: Martha's Cuisines Invoice App

Design: `docs/superpowers/specs/2026-11-12-marthas-invoice-design.md` (approved).
Working mode: agent writes code in small steps, user reviews, gives clues, writes own commit messages and `docs/learning.md`.

## Phase 0: Setup
1. Check Node.js is installed (`node -v`). Install if missing (ask first).
2. `npm init`, create folders: `public/` (frontend), `src/` (backend and logic), `test/`, `docs/`.
3. Copy `logo.jpeg` into `public/assets/` untouched. Never edit, recolour, crop or stretch it.
4. Sample the burnt orange from the logo and record the exact hex in `public/css/tokens.css`. Orange, black and white are the main colours; other colours only where necessary (status and errors), small and rare.
5. Start `git init`, first commit (user writes message).
User task: sample the orange herself using clues.

## Phase 1: Totals logic (no UI)
1. `src/money.js`: pesewas helpers (cedis to pesewas, format as GHS).
2. `src/totals.js`: pure function: package rate x guests + set up charge + extras - discount - deposit = balance. Enforces nothing silently (returns a warning if guests under 150).
3. `src/packages.js`: Bronze 80, Silver 100, Gold 120, set up 500, min guests 150.
4. Tests in `test/totals.test.js`: normal case, under minimum guests, discount, deposit larger than total, rounding.
User task: add one test case of her own. Break it on purpose: change a rate to a decimal and predict the result.

## Phase 2: Invoice screen (frontend only)
1. Builder form: client, event date, venue, package, guests, dishes (checkboxes from the rate card), extras, discount, deposit. Phone first.
2. Live totals bar at the bottom, driven by `totals.js` (shared logic).
3. Invoice preview matching the visual direction (ring around balance due, What's included block).
4. Print stylesheet so "Download PDF" produces a clean A4 page.
User task: change the invoice footer text herself.

## Phase 3: Backend and database
1. Express server, SQLite (`better-sqlite3`), tables: clients, invoices, invoice_lines.
2. Sequential numbers MC-0001, MC-0002 assigned by the server, never the browser.
3. API: create, list, get, update, mark paid. Validation on the server; recompute totals server side, never trust the browser's total.
4. Frontend: Save invoice, invoice list with search, open, mark paid.
5. Single password login (password from environment variable, never in the repo).
6. API tests.
User task: add a "notes" field end to end, using clues.

## Phase 4: Polish and ship
1. Responsive check on a phone, keyboard focus, reduced motion.
2. "Send on WhatsApp" link with a prefilled message.
3. Deployment to a small host with an environment variable for the password, and a backup plan for the database file.
4. README, architecture diagram, run instructions, a measured number (time to create an invoice, test count).

## Phase 5 (optional): AI draft from a WhatsApp message
Structured output turns a pasted message into a draft invoice, human confirms before saving. Small eval set of 10 real style messages. Prompt injection note: treat pasted text as data.

## Open items to resolve before Phase 2 ends
- Tax or VAT lines (ask the aunt or her accountant).
- Deposit and due date rules.
