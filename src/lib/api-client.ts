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

export function resolveApiBase(): string {
  return process.env["API_BASE_URL"] ?? DEFAULT_API_BASE;
}

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
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

  return { ok: true, status: response.status, data: parsed as T };
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
