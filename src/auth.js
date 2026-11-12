// One shared password. A signed, expiring cookie keeps the aunt logged in.
import crypto from "node:crypto";

const DAY = 24 * 60 * 60 * 1000;
const COOKIE = "mc_session";

const sha = (s) => crypto.createHash("sha256").update(s).digest();

export function createAuth({ password, secret = crypto.randomBytes(32).toString("hex") }) {
  const sign = (value) => crypto.createHmac("sha256", secret).update(value).digest("hex");
  const fails = new Map(); // ip -> { count, resetAt }

  const cookieValue = (req) => {
    const match = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE + "="));
    return match ? match.slice(COOKIE.length + 1) : "";
  };

  const isLoggedIn = (req) => {
    const [expires, sig] = cookieValue(req).split(".");
    if (!expires || !sig || Number(expires) < Date.now()) return false;
    const good = sign(expires);
    return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
  };

  return {
    requireLogin(req, res, next) {
      if (isLoggedIn(req)) return next();
      res.status(401).json({ error: "Please log in" });
    },
    isLoggedIn,
    login(req, res) {
      const ip = req.ip;
      const now = Date.now();
      const entry = fails.get(ip);
      if (entry && entry.resetAt > now && entry.count >= 5) {
        return res.status(429).json({ error: "Too many tries. Wait a minute and try again." });
      }
      const given = typeof req.body?.password === "string" ? req.body.password : "";
      if (!crypto.timingSafeEqual(sha(given), sha(password))) {
        const e = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + 60_000 };
        e.count += 1;
        fails.set(ip, e);
        return res.status(401).json({ error: "Wrong password" });
      }
      fails.delete(ip);
      const expires = String(now + 7 * DAY);
      res.cookie(COOKIE, `${expires}.${sign(expires)}`, {
        httpOnly: true, sameSite: "strict", secure: req.secure, maxAge: 7 * DAY,
      });
      res.json({ ok: true });
    },
    logout(req, res) {
      res.clearCookie(COOKIE);
      res.json({ ok: true });
    },
  };
}
