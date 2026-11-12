# Martha's Cuisines Invoice App: Design

Date: 2026-11-12. Status: awaiting approval.

## Intent and why
Martha's Cuisines (Madina, Accra) is a catering business run by the user's aunt, Mawufemor Afi Gborglah. She has no invoicing process today. This app lets her produce a professional, branded invoice for an event booking in a minute, and keep a record of them.
The builder (the user) is a CS student aiming for AI engineering. The project doubles as a learning vehicle and a portfolio piece, and must also be genuinely usable by the aunt. The user reviews all code and should be able to explain every part.

## Facts from the user and the folder
- Business name: Martha's Cuisines. Tagline on logo: "It can't go wrong with us".
- Address: Madina, Maye Hot. Phones: 0546155309 / 0509865006. Email: gborglahmawufemor@gmail.com.
- Mobile money: 0546155309 (Mawufemor Afi Gborglah).
- Bank: Fidelity Bank, Madina Branch, account 2030453360411, Mawufemor Afi Gborglah.
- Colours: burnt orange, black, white. Logo: `logo.jpeg` (orange script M, black fork and spoon ring).
- Pricing (2026 rate card, `2026 MARTHA'S CUISINE MENU.pdf`): Bronze 80, Silver 100, Gold 120 cedis per head. Set up charge 500 GH. Minimum 150 guests. Packages can be adjusted to suit the customer. Menu also has starters (choose 1), desserts (choose 1), rice dishes, local dishes and extras.

## Goals
- Create an invoice from: client, event date and venue, package, guest count, chosen dishes, extras, adjustments.
- Calculate totals correctly in GHS: package price x guests, plus set up charge, plus extras, minus discount, minus deposit paid, equals balance due.
- Output a clean branded invoice as PDF, easy to send on WhatsApp.
- Save invoices with sequential numbers (MC-0001 ...), list and search them, mark them paid.
- Be a clear, explainable codebase with README, diagram, tests and run instructions.

## Non-goals
- Online payments, accounting, inventory, multi-user roles, tax filing.
- A mobile app. The web app just has to work well on a phone browser.

## Anti-goals (failure even if it works)
- Wrong totals on an invoice sent to a client.
- Code the user cannot explain.
- Something the aunt finds fiddly: invoice creation should take under two minutes.

## Constraints
- Currency GHS only. Cedi amounts shown to 2 decimals.
- Store money as integer pesewas to avoid rounding errors (a learning point).
- No secrets in the repo.
- User writes with clues; the agent writes code and the user reviews (their choice).

## Approaches considered
- A. Single page app, browser storage only: fastest, but invoices live on one device and are lost if the browser is cleared. Not how real systems work.
- B. Frontend plus backend plus database: what companies use for their own invoicing; teaches the standard architecture. More to build.
- C. Spreadsheet or Word template: not software.
- Chosen: B, built in stages so the aunt gets something usable early. Chosen by the user after seeing what companies use.

## Design (my calls, open to correction)
Stack: Node.js with Express for the API, SQLite for storage, plain HTML, CSS and JavaScript for the frontend (the user is comfortable with HTML and CSS and knows some JavaScript; one language on both sides). Tests with Node's built in test runner.

Stages:
1. Invoice builder screen with package pickers, live totals, and a print stylesheet so "Save as PDF" gives a branded invoice. No saving yet. Totals logic is a separate, tested module.
2. Backend and database: tables for invoices, invoice lines and clients; sequential numbering; list, search, edit, mark paid; simple single password login so only the aunt can open it.
3. Optional: AI feature that drafts an invoice from a pasted WhatsApp message using structured output, with a human check before saving. Evals for it.

Invoice layout: logo and contact top, "INVOICE" with number and dates, bill to, event details, line table, totals, payment box (bank and mobile money), thank you line. Burnt orange headings and rules, black text, white background.

Package presets live in the database so prices can change in 2027 without code changes.

## Visual direction (added after design review)
Subject: a catering invoice for Ghanaian events, read mostly on a phone via WhatsApp and sometimes printed. Its job: make the amount owed, what is included, and how to pay impossible to miss.
- Colour (client rule, do not change): the client's colours are burnt orange, black and white, and they are the main colours everywhere. The orange is the exact value sampled from the logo, used as is with no tints, shades or gradients. Other colours are allowed only where necessary (for example green for Paid, red for an error message) and must stay small and rare. No cream, no grey cards.
- Logo (client rule): `logo.jpeg` is used exactly as supplied. No recolouring, cropping, stretching, effects or redrawing. It sits on white with clear space around it.
- Type: a sturdy serif for headings that echoes the spaced serif of "CUISINES" in the logo, and a clean sans with tabular figures for the table and money so cedi amounts line up. The script from the logo appears only in the logo image.
- Memorable element (the one bold thing): the balance due is set large in orange, with a thin open ring drawn around it that echoes the plate ring in the logo. Everything else stays quiet.
- Include a "What's included" block listing the dishes chosen. Clients want to see what they are paying for.
- No numbered markers, no all caps eyebrow labels, no arrows on buttons, no decorative shadows or gradients.
- App screens for the aunt: phone first, large touch targets, totals always visible at the bottom, plain button text: "Save invoice", "Download PDF", "Send on WhatsApp".

## Left to the builder
- Exact burnt orange hex (sample from the logo, use unchanged).
- Folder structure, naming, error handling details.
- Whether to use CSS print or a PDF library in stage 2.

## Open items (my default if no answer)
- Tax lines (VAT, levies): default is none, with an optional "tax" field off by default. Ask the aunt or her accountant.
- Payment terms (deposit percentage, due date): default is a free deposit field and due date on the invoice.
- Business name spelling on the invoice: "Martha's Cuisines".
