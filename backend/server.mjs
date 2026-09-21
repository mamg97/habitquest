import crypto from "node:crypto";
import express from "express";
import { Firestore, FieldValue } from "@google-cloud/firestore";
import { google } from "googleapis";

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  FRONTEND_ORIGIN = "https://mamg97.github.io",
  PORT = "8080",
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.");
}

const firestore = new Firestore();
const app = express();
app.use(express.json({ limit: "32kb" }));

const oauth2 = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  FRONTEND_ORIGIN,
);

function allowedOrigin(req) {
  return req.headers.origin === FRONTEND_ORIGIN;
}

function setCors(req, res) {
  if (allowedOrigin(req)) {
    res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
}

app.use((req, res, next) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return res.sendStatus(403);
    return res.sendStatus(204);
  }
  next();
});

function sessionHash(sessionToken) {
  return crypto.createHash("sha256").update(sessionToken).digest("hex");
}

function readBearer(req) {
  const value = req.headers.authorization || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function loadSession(req) {
  const token = readBearer(req);
  if (!token) return null;
  const ref = firestore.collection("oauth_sessions").doc(sessionHash(token));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data?.refreshToken || data.revoked) return null;
  return { ref, data };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/oauth/exchange", async (req, res) => {
  try {
    if (!allowedOrigin(req)) return res.status(403).json({ error: "origin_not_allowed" });
    if (req.headers["x-requested-with"] !== "XmlHttpRequest") {
      return res.status(400).json({ error: "missing_csrf_header" });
    }

    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ error: "missing_code" });

    const { tokens } = await oauth2.getToken({
      code,
      redirect_uri: FRONTEND_ORIGIN,
    });

    if (!tokens.refresh_token) {
      return res.status(409).json({
        error: "refresh_token_missing",
        message:
          "Google did not issue a refresh token. Revoke HabitQuest access in your Google Account permissions, then connect again.",
      });
    }

    const sessionToken = crypto.randomBytes(32).toString("base64url");
    const docId = sessionHash(sessionToken);

    await firestore.collection("oauth_sessions").doc(docId).set({
      refreshToken: tokens.refresh_token,
      scope: tokens.scope || null,
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: FieldValue.serverTimestamp(),
      revoked: false,
    });

    res.json({
      sessionToken,
      accessToken: tokens.access_token || null,
      expiresAt: tokens.expiry_date || null,
    });
  } catch (error) {
    console.error("oauth/exchange failed", error);
    res.status(500).json({ error: "oauth_exchange_failed" });
  }
});

app.post("/token", async (req, res) => {
  try {
    if (!allowedOrigin(req)) return res.status(403).json({ error: "origin_not_allowed" });

    const session = await loadSession(req);
    if (!session) return res.status(401).json({ error: "invalid_session" });

    oauth2.setCredentials({ refresh_token: session.data.refreshToken });
    const tokenResult = await oauth2.getAccessToken();
    const accessToken = tokenResult?.token;

    if (!accessToken) {
      return res.status(401).json({ error: "token_refresh_failed" });
    }

    await session.ref.update({ lastUsedAt: FieldValue.serverTimestamp() });

    res.json({
      accessToken,
      expiresAt: oauth2.credentials.expiry_date || Date.now() + 55 * 60 * 1000,
    });
  } catch (error) {
    console.error("token refresh failed", error);
    res.status(500).json({ error: "token_refresh_failed" });
  }
});

app.delete("/session", async (req, res) => {
  try {
    if (!allowedOrigin(req)) return res.status(403).json({ error: "origin_not_allowed" });

    const token = readBearer(req);
    if (!token) return res.sendStatus(204);

    const ref = firestore.collection("oauth_sessions").doc(sessionHash(token));
    await ref.delete();
    res.sendStatus(204);
  } catch (error) {
    console.error("session delete failed", error);
    res.status(500).json({ error: "session_delete_failed" });
  }
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`HabitQuest OAuth backend listening on port ${PORT}`);
});
