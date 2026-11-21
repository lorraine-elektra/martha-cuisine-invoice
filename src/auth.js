// One shared PIN. A signed, expiring cookie keeps the aunt logged in.
import crypto from "node:crypto";

export const IDLE_MS = 10 * 60_000;          // no activity for this long: log in again
const SESSION_MS = 8 * 60 * 60 * 1000;   // and never longer than this in total (also ends when the browser closes)
const COOKIE = "mc_login"; // new name: sessions from before the PIN existed no longer work

const sha = (s) => crypto.createHash("sha256").update(s).digest();

// A second, separate PIN guards actions that cannot be undone. It is checked on the server every
// time (never remembered by the browser), compared in constant time, and locked out after repeated misses.
export const PIN_PATTERN = /^\d{4,8}$/;
const PIN_MAX_TRIES = 5;
const PIN_LOCK_MS = 15 * 60_000;

export function createAuth({ pin, secret = crypto.randomBytes(32).toString("hex") }) {
  if (!PIN_PATTERN.test(String(pin ?? ""))) throw new Error("A PIN of 4 to 8 digits is required");
  let pinFails = 0;
  let pinLockedUntil = 0;
  const sign = (value) => crypto.createHmac("sha256", secret).update(value).digest("hex");
  const fails = new Map(); // ip -> { count, resetAt }

  const cookieValue = (req) => {
    const match = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE + "="));
    return match ? match.slice(COOKIE.length + 1) : "";
  };

  // Cookie = "<expires>.<started>.<signature>". Each request while active pushes `expires` forward.
  const readSession = (req) => {
    const [expires, started, sig] = cookieValue(req).split(".");
    if (!expires || !started || !sig) return null;
    const good = sign(`${expires}.${started}`);
    if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
    const now = Date.now();
    return Number(expires) > now && Number(started) + SESSION_MS > now ? { started: Number(started) } : null;
  };
  const isLoggedIn = (req) => readSession(req) !== null;
  const setSession = (req, res, started) => {
    const expires = String(Math.min(Date.now() + IDLE_MS, started + SESSION_MS));
    res.cookie(COOKIE, `${expires}.${started}.${sign(`${expires}.${started}`)}`, {
      httpOnly: true, sameSite: "strict", secure: req.secure, // no maxAge: a session cookie
    });
  };

  return {
    requireLogin(req, res, next) {
      const session = readSession(req);
      if (session) { setSession(req, res, session.started); return next(); }
      res.status(401).json({ error: "Please log in" });
    },
    isLoggedIn,
    // Use after requireLogin. Reads the PIN from the request body and refuses the request if it is wrong.
    requirePin(req, res, next) {
      const now = Date.now();
      if (pinLockedUntil > now) {
        const mins = Math.ceil((pinLockedUntil - now) / 60_000);
        return res.status(429).json({ error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}` });
      }
      const given = typeof req.body?.pin === "string" ? req.body.pin : "";
      if (!crypto.timingSafeEqual(sha(given), sha(pin))) {
        pinFails += 1;
        if (pinFails >= PIN_MAX_TRIES) { pinLockedUntil = now + PIN_LOCK_MS; pinFails = 0; }
        return res.status(403).json({ error: given ? "Wrong PIN" : "Enter your PIN", pinRequired: true });
      }
      pinFails = 0;
      next();
    },
    login(req, res) {
      const ip = req.ip;
      const now = Date.now();
      const entry = fails.get(ip);
      if (entry && entry.resetAt > now && entry.count >= 5) {
        return res.status(429).json({ error: "Too many tries. Wait 15 minutes and try again" });
      }
      const givenPin = typeof req.body?.pin === "string" ? req.body.pin : "";
      const pinOk = crypto.timingSafeEqual(sha(givenPin), sha(pin));
      if (!pinOk) {
        const e = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + PIN_LOCK_MS };
        e.count += 1;
        fails.set(ip, e);
        return res.status(401).json({ error: "Wrong PIN" });
      }
      fails.delete(ip);
      setSession(req, res, now);
      res.json({ ok: true });
    },
    logout(req, res) {
      res.clearCookie(COOKIE);
      res.json({ ok: true });
    },
  };
}
