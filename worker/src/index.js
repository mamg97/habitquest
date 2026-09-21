const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(secret, usages) {
  const material = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

async function seal(payload, secret) {
  const key = await deriveKey(secret, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  const joined = new Uint8Array(iv.length + ciphertext.length);
  joined.set(iv);
  joined.set(ciphertext, iv.length);
  return base64url(joined);
}

async function unseal(token, secret) {
  const bytes = fromBase64url(token);
  if (bytes.length < 13) throw new Error("invalid_session");
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const key = await deriveKey(secret, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function signState(payload, secret) {
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return body + "." + base64url(sig);
}

async function verifyState(value, secret) {
  const [body, sig] = String(value || "").split(".");
  if (!body || !sig) throw new Error("invalid_state");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64url(sig),
    new TextEncoder().encode(body),
  );
  if (!ok) throw new Error("invalid_state");
  const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
  if (!payload?.iat || Date.now() - payload.iat > 10 * 60 * 1000) {
    throw new Error("expired_state");
  }
  return payload;
}

function corsHeaders(origin, env) {
  if (origin !== env.FRONTEND_ORIGIN) return {};
  return {
    "access-control-allow-origin": env.FRONTEND_ORIGIN,
    "access-control-allow-methods": "POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "vary": "Origin",
  };
}

async function exchangeCode(code, redirectUri, env) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "token_exchange_failed");
  return data;
}

async function refreshAccessToken(refreshToken, env) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "token_refresh_failed");
  return data;
}

async function handleStart(request, env) {
  const requestUrl = new URL(request.url);
  const redirectUri = requestUrl.origin + "/oauth/callback";
  const state = await signState(
    { iat: Date.now(), nonce: crypto.randomUUID() },
    env.SESSION_SECRET,
  );
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", SHEETS_SCOPE);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("state", state);
  return Response.redirect(auth.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return new Response("Google authorization was cancelled.", { status: 400 });
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return new Response("Missing OAuth response.", { status: 400 });

  await verifyState(state, env.SESSION_SECRET);

  const redirectUri = url.origin + "/oauth/callback";
  const tokens = await exchangeCode(code, redirectUri, env);
  if (!tokens.refresh_token) {
    return new Response(
      "Google did not return a refresh token. Revoke HabitQuest access in your Google Account permissions and connect again.",
      { status: 409 },
    );
  }

  const days = Math.max(1, Number(env.SESSION_DAYS || 90));
  const sessionToken = await seal(
    {
      refreshToken: tokens.refresh_token,
      exp: Date.now() + days * 24 * 60 * 60 * 1000,
    },
    env.SESSION_SECRET,
  );

  const appUrl = String(env.FRONTEND_APP_URL || (env.FRONTEND_ORIGIN + "/habitquest/"));
  const redirect = appUrl.replace(/#.*$/, "") + "#oauth_session=" + encodeURIComponent(sessionToken);
  return Response.redirect(redirect, 302);
}

async function readSession(request, env) {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("missing_session");
  const payload = await unseal(match[1], env.SESSION_SECRET);
  if (!payload?.refreshToken || !payload?.exp || payload.exp <= Date.now()) {
    throw new Error("expired_session");
  }
  return payload;
}

async function handleToken(request, env) {
  const session = await readSession(request, env);
  const tokens = await refreshAccessToken(session.refreshToken, env);
  return json({
    accessToken: tokens.access_token,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
  }, {
    headers: corsHeaders(request.headers.get("origin"), env),
  });
}

async function handleDeleteSession(request, env) {
  const session = await readSession(request, env);
  try {
    await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(session.refreshToken), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  } catch {}
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin"), env),
  });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        const origin = request.headers.get("origin");
        if (origin !== env.FRONTEND_ORIGIN) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true });
      }
      if (request.method === "GET" && url.pathname === "/oauth/start") {
        return handleStart(request, env);
      }
      if (request.method === "GET" && url.pathname === "/oauth/callback") {
        return handleCallback(request, env);
      }
      if (request.method === "POST" && url.pathname === "/token") {
        const origin = request.headers.get("origin");
        if (origin !== env.FRONTEND_ORIGIN) return json({ error: "origin_not_allowed" }, { status: 403 });
        return handleToken(request, env);
      }
      if (request.method === "DELETE" && url.pathname === "/session") {
        const origin = request.headers.get("origin");
        if (origin !== env.FRONTEND_ORIGIN) return json({ error: "origin_not_allowed" }, { status: 403 });
        return handleDeleteSession(request, env);
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error(error);
      return json(
        { error: error instanceof Error ? error.message : "unexpected_error" },
        { status: 400 },
      );
    }
  },
};
