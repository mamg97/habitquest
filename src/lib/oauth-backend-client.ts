const BACKEND_URL_KEY = "habitquest.oauth-backend-url.v1";
const SESSION_TOKEN_KEY = "habitquest.oauth-session.v1";

export type BackendTokenResponse = {
  accessToken: string | null;
  expiresAt: number | null;
};

export type BackendExchangeResponse = BackendTokenResponse & {
  sessionToken: string;
};

export function getStoredBackendUrl() {
  try {
    return window.localStorage.getItem(BACKEND_URL_KEY)?.trim() || "";
  } catch {
    return "";
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

export async function exchangeAuthorizationCode(
  backendUrl: string,
  code: string,
): Promise<BackendExchangeResponse> {
  return backendFetch<BackendExchangeResponse>(backendUrl, "/oauth/exchange", null, {
    method: "POST",
    headers: {
      "X-Requested-With": "XmlHttpRequest",
    },
    body: JSON.stringify({ code }),
  });
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
