const BACKEND_URL_KEY = "habitquest.oauth-backend-url.v1";
const SESSION_TOKEN_KEY = "habitquest.oauth-session.v1";
const DEFAULT_BACKEND_URL = "https://habitquest-oauth.mamg97.workers.dev";

export type BackendTokenResponse = {
  accessToken: string | null;
  expiresAt: number | null;
};

export function getStoredBackendUrl() {
  try {
    return window.localStorage.getItem(BACKEND_URL_KEY)?.trim() || DEFAULT_BACKEND_URL;
  } catch {
    return DEFAULT_BACKEND_URL;
  }
}

export function storeBackendUrl(url: string) {
  try {
    const clean = url.trim().replace(/\/$/, "");
    if (clean) window.localStorage.setItem(BACKEND_URL_KEY, clean);
    else window.localStorage.removeItem(BACKEND_URL_KEY);
  } catch {
    /* ignore unavailable storage */
  }
}

export function getStoredBackendSession() {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function storeBackendSession(sessionToken: string) {
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  } catch {
    /* ignore unavailable storage */
  }
}

export function clearBackendSession() {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* ignore unavailable storage */
  }
}

export function consumeBackendSessionFromUrl() {
  try {
    const hash = window.location.hash;
    if (!hash.startsWith("#oauth_session=")) return null;
    const value = decodeURIComponent(hash.slice("#oauth_session=".length));
    if (!value) return null;

    storeBackendSession(value);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search + "#/profile",
    );
    return value;
  } catch {
    return null;
  }
}

export function startBackendAuthorization(backendUrl: string) {
  window.location.assign(backendUrl.replace(/\/$/, "") + "/oauth/start");
}

async function backendFetch<T>(
  backendUrl: string,
  path: string,
  sessionToken?: string | null,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);

  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message || parsed.error || message;
    } catch {
      /* keep raw response */
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function refreshBackendAccessToken(
  backendUrl: string,
  sessionToken: string,
): Promise<BackendTokenResponse> {
  return backendFetch<BackendTokenResponse>(backendUrl, "/token", sessionToken, {
    method: "POST",
    body: "{}",
  });
}

export async function revokeBackendSession(
  backendUrl: string,
  sessionToken: string,
): Promise<void> {
  await backendFetch<void>(backendUrl, "/session", sessionToken, {
    method: "DELETE",
  });
}
