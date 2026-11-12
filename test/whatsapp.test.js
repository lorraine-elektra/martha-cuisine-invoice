import { test } from "node:test";
import assert from "node:assert/strict";
import { ghanaNumber, whatsappLink } from "../src/whatsapp.js";

test("Ghana numbers are converted to international form", () => {
  assert.equal(ghanaNumber("0546155309"), "233546155309");
  assert.equal(ghanaNumber("+233 54 615 5309"), "233546155309");
  assert.equal(ghanaNumber("12345"), "");
  assert.equal(ghanaNumber(""), "");
});

test("link carries the number and an encoded message", () => {
  const url = whatsappLink({ phone: "0240000000", clientName: "Ama & Co", number: "MC-0001", balanceText: "GHS 100.00" });
  assert.ok(url.startsWith("https://wa.me/233240000000?text="));
  assert.ok(url.includes(encodeURIComponent("Ama & Co")));
  assert.ok(!url.includes("&Co"));
});

test("no phone still gives a link that lets her pick the chat", () => {
  const url = whatsappLink({ phone: "", clientName: "Kofi", number: "MC-0002", balanceText: "GHS 1.00" });
  assert.ok(url.startsWith("https://wa.me/?text="));
});
