import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiGet } from "../src/lib/api-client";
import { readAuth, saveAuth, type AuthData } from "../src/lib/config";
import { redirectConfigDir, restoreConfigDir } from "./helpers/config-isolation";
const originalFetch = globalThis.fetch;
function mockFetch(
  handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(handler, { preconnect: originalFetch.preconnect });
}
let directory: string;
const auth: AuthData = {
  version: 1,
  email: "old@example.test",
  access_token: "old-token",
  refresh_token: "old-refresh",
  expires_at: "2099-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
};
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "cli-revocation-"));
  redirectConfigDir(directory);
  saveAuth(auth);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreConfigDir();
  rmSync(directory, { recursive: true, force: true });
});
describe("content request revocation", () => {
  it.each([401, 403])(
    "clears the credentials on email_changed with status %s",
    async (status) => {
      globalThis.fetch = mockFetch(async () =>
        Response.json({ error: "email_changed" }, { status }));
      const result = await apiGet("/courses/10xdevs-3/modules", { token: auth.access_token });
      expect(result).toMatchObject({ ok: false, status, code: "email_changed" });
      if (!result.ok) expect(result.error).toContain("10x auth");
      expect(readAuth()).toBeNull();
    },
  );
  it("retains a newer login saved before an old content response arrives", async () => {
    let deliver!: (value: Response) => void;
    globalThis.fetch = mockFetch(() =>
      new Promise<Response>((resolve) => {
        deliver = resolve;
      }));
    const pending = apiGet("/courses/10xdevs-3/modules", { token: auth.access_token });
    saveAuth({ ...auth, access_token: "new-token", refresh_token: "new-refresh" });
    deliver(Response.json({ code: "email_changed" }, { status: 401 }));
    const result = await pending;
    expect(result).toMatchObject({ ok: false, code: "email_changed" });
    if (!result.ok) expect(result.error).toContain("10x auth");
    expect(readAuth()?.access_token).toBe("new-token");
  });
});
