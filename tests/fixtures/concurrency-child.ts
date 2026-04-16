/**
 * Helper script spawned by tests/auth-guard-concurrency.test.ts.
 *
 * Calls requireAuth with an injected refresh function that:
 *   - appends a single byte to RACE_COUNTER (atomic on POSIX for short writes
 *     under O_APPEND), so the parent test can count refreshes across children
 *   - returns a deterministic rotated TokenBundle so both children must end up
 *     with byte-identical persisted auth.json on disk
 *
 * The resulting AuthData (or error) is JSON-encoded to RACE_RESULT for the
 * parent to assert against.
 */

import { appendFileSync, writeFileSync } from "node:fs";
import { requireAuth } from "../../src/lib/auth-guard";
import type { ApiResult } from "../../src/lib/api-client";
import type { TokenBundle } from "../../src/lib/auth-flow";

const counterFile = process.env["RACE_COUNTER"];
const resultFile = process.env["RACE_RESULT"];
const newToken = process.env["RACE_NEW_TOKEN"] ?? "jwt-rotated";
const newRefresh = process.env["RACE_NEW_REFRESH"] ?? "rt-rotated";
const newExpires = process.env["RACE_NEW_EXPIRES"];
const refreshDelayMs = Number(process.env["RACE_REFRESH_DELAY_MS"] ?? "500");

if (!counterFile || !resultFile || !newExpires) {
  process.stderr.write("concurrency-child: missing required env vars\n");
  process.exit(2);
}

async function main(): Promise<void> {
  try {
    const result = await requireAuth(
      { json: true, verbose: false },
      {
        refresh: async (): Promise<ApiResult<TokenBundle>> => {
          appendFileSync(counterFile!, "X");
          // Hold the lock long enough that the sibling process must wait.
          if (refreshDelayMs > 0) {
            await new Promise((r) => setTimeout(r, refreshDelayMs));
          }
          return {
            ok: true,
            status: 200,
            data: {
              token: newToken,
              refresh_token: newRefresh,
              expires_at: newExpires!,
            },
            responseHeaders: new Headers(),
            rawBody: "",
          };
        },
      },
    );
    writeFileSync(resultFile!, JSON.stringify({ ok: true, auth: result }));
    process.exit(0);
  } catch (err) {
    writeFileSync(
      resultFile!,
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exit(1);
  }
}

void main();
