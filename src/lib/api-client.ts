/**
 * Typed HTTP client for the 10x-toolkit delivery API.
 *
 * The API surface is described by src/generated/api-types.ts, which is
 * generated from the live /openapi.json endpoint via `bun run generate-types`.
 *
 * This module intentionally stays thin: commands compose it with auth
 * handling and output formatting. Error envelopes are discriminated unions
 * so callers must handle the `ok: false` branch explicitly.
 */

export const DEFAULT_API_BASE = "https://10x-toolkit-api.przeprogramowani.workers.dev";

/**
 * Exact hostname allowlist for `API_BASE_URL`. We intentionally keep this
 * very small — the production host is stable, and loose validation of this
 * env var is a one-step path to token harvest (attacker sets one env var,
 * redirects `/auth/login` + `/auth/verify` to a host they control). See the
 * 2026-04-11 security review finding F3.
 *
 * If a staging/preview host needs to be reachable, add it here explicitly
 * rather than relaxing the validation rules.
 */
const PROD_HOSTNAME = "10x-toolkit-api.przeprogramowani.workers.dev";
const DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function resolveApiBase(): string {
  const override = process.env["API_BASE_URL"];
  if (!override) return DEFAULT_API_BASE;

  let url: URL;
  try {
    url = new URL(override);
  } catch {
    throw new Error(
      `API_BASE_URL is not a valid URL: ${JSON.stringify(override)}`,
    );
  }

  // Path prefixes are rejected — the client composes its own paths like
  // `/auth/login`, so a base with a path would both break routing and
  // enable nested-path tricks (e.g. `https://prod/@attacker.com/`).
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(
      `API_BASE_URL must not include a path (got ${JSON.stringify(url.pathname)})`,
    );
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("API_BASE_URL must not include a query string or fragment");
  }

  // Production: exact https match on the canonical hostname.
  if (url.protocol === "https:" && url.hostname === PROD_HOSTNAME) {
    return `${url.protocol}//${url.host}`;
  }
  // Local dev: plain http on loopback only, any port.
  if (url.protocol === "http:" && DEV_HOSTNAMES.has(url.hostname)) {
    return `${url.protocol}//${url.host}`;
  }

  throw new Error(
    `API_BASE_URL must be ${DEFAULT_API_BASE} or http://localhost[:port] (got ${JSON.stringify(override)})`,
  );
}

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number; responseHeaders: Headers }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
      payload?: ApiErrorPayload;
    };

interface RequestOptions {
  token?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const base = resolveApiBase();
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "10x-cli",
    ...options.headers,
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const init: RequestInit = {
    method,
    headers,
    signal: options.signal,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      code: "network_error",
      error: message,
    };
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON response body — leave parsed undefined.
    }
  }

  if (!response.ok) {
    const payload =
      parsed && typeof parsed === "object" ? (parsed as ApiErrorPayload) : undefined;
    return {
      ok: false,
      status: response.status,
      code: (payload?.code as string) ?? `http_${response.status}`,
      error: (payload?.error as string) ?? (payload?.message as string) ?? response.statusText,
      payload,
    };
  }

  return { ok: true, status: response.status, data: parsed as T, responseHeaders: response.headers };
}

export function apiGet<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  return request<T>("GET", path, undefined, options);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  return request<T>("POST", path, body, options);
}
