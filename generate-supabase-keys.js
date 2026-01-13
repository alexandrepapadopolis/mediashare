import crypto from "crypto";

// Base64URL helpers (JWT uses base64url, not base64)
function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}

function signHs256(data, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeJwt({ role, jwtSecret, expiresInSeconds }) {
  const header = { alg: "HS256", typ: "JWT" };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role,
    iss: "supabase",
    // aud: para anon normalmente "anon"; para service_role costuma "authenticated"
    aud: role === "anon" ? "anon" : "authenticated",
    iat: now,
    exp: now + expiresInSeconds,
  };

  const h = b64urlJson(header);
  const p = b64urlJson(payload);
  const data = `${h}.${p}`;
  const s = signHs256(data, jwtSecret);
  return `${data}.${s}`;
}

// 1) JWT_SECRET forte (hex com 48 bytes = 96 chars)
const JWT_SECRET = crypto.randomBytes(48).toString("hex");

// 10 anos em segundos (aprox.)
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;

const ANON_KEY = makeJwt({ role: "anon", jwtSecret: JWT_SECRET, expiresInSeconds: TEN_YEARS });
const SERVICE_ROLE_KEY = makeJwt({
  role: "service_role",
  jwtSecret: JWT_SECRET,
  expiresInSeconds: TEN_YEARS,
});

console.log("\n=== SUPABASE KEYS (LOCAL) ===\n");
console.log("JWT_SECRET=" + JWT_SECRET);
console.log("\nANON_KEY=" + ANON_KEY);
console.log("\nSERVICE_ROLE_KEY=" + SERVICE_ROLE_KEY);
console.log("\n============================\n");
