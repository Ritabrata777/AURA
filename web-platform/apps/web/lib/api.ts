/**
 * Typed HTTP client for the NestJS API.
 *
 * The web app talks to the API over authenticated REST and WebSocket only
 * (see README): no MQTT, no database, no server credentials.
 */

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
).replace(/\/+$/, "");

/** The API mounts everything except `/health` under the `api` prefix. */
const API_PREFIX = "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** A stale or missing token — the caller should send the user back to login. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** Authenticated but not permitted, e.g. a doctor without patient consent. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * Nest returns validation failures as `{ message: string[] }` and most other
 * errors as `{ message: string }`. Collapse both into one readable line so the
 * UI never renders "[object Object]".
 */
function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message: unknown }).message;

    if (Array.isArray(message)) {
      const parts = message.filter((item): item is string => typeof item === "string");
      if (parts.length > 0) {
        return parts.join(", ");
      }
    }

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, signal } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // An aborted request is normal teardown, not a failure worth surfacing.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(0, `Cannot reach the API at ${API_BASE_URL}. Is it running?`);
  }

  // 204 and other empty bodies would throw on .json().
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractErrorMessage(payload, `Request failed with status ${response.status}`),
    );
  }

  return payload as T;
}

/** Serializes defined query params only, so `?limit=undefined` never appears. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}
