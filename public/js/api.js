// Small wrapper around fetch: sends JSON, sends you to the login page if the session ended.
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    location.href = "/login.html";
    throw new Error("Please log in");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong"), { pinRequired: data.pinRequired === true });
  return data;
}

export function wireLogout() {
  document.querySelector("#logout")?.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login.html";
  });
}

// ---------- idle log-out ----------
// While someone is working, tell the server now and then so the session stays alive. After 10 quiet
// minutes the server would refuse the next request anyway, so leave first and do not keep invoices on screen.
const IDLE_MS = 10 * 60_000;
const PING_EVERY_MS = 2 * 60_000;
let lastPing = Date.now();
let idleTimer;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    location.href = "/login.html";
  }, IDLE_MS);
  if (Date.now() - lastPing > PING_EVERY_MS) {
    lastPing = Date.now();
    fetch("/api/session").then((r) => { if (r.status === 401) location.href = "/login.html"; }).catch(() => {});
  }
}
for (const type of ["pointerdown", "keydown", "scroll", "touchstart"]) addEventListener(type, resetIdle, { passive: true });
resetIdle();
