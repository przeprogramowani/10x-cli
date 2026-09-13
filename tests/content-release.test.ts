import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchCatalog,
  fetchModules,
  fetchModuleDetail,
  fetchLesson,
  fetchArtifact,
  fetchMigrationMap,
  type ReleaseSelection,
} from "../src/lib/api-content";
const selected: ReleaseSelection = {
  course: "10xdevs4",
  releaseId: `r-${"a".repeat(64)}`,
  releaseManifestHash: "b".repeat(64),
};
const actualFetch = globalThis.fetch;
const oldApi = process.env["API_BASE_URL"];
function mockFetch(
  handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(handler, { preconnect: actualFetch.preconnect });
}
beforeEach(() => {
  process.env["API_BASE_URL"] = "http://localhost:8787";
});
afterEach(() => {
  globalThis.fetch = actualFetch;
  if (oldApi === undefined) delete process.env["API_BASE_URL"];
  else process.env["API_BASE_URL"] = oldApi;
});
const calls: Array<[string, () => Promise<unknown>]> = [
  ["catalog", () => fetchCatalog("10xdevs4", "token", { release: selected })],
  ["modules", () => fetchModules("10xdevs4", "token", { release: selected })],
  ["module-detail", () => fetchModuleDetail("10xdevs4", 1, "token", { release: selected })],
  ["lesson", () => fetchLesson("10xdevs4", "m1l1", "token", { release: selected })],
  [
    "artifact",
    () =>
      fetchArtifact("10xdevs4", "m1l1", "prompts", "hello", "claude-code", "token", {
        release: selected,
      }),
  ],
  ["migration-map", () => fetchMigrationMap("10xdevs4", "token", selected)],
];
describe("selected release response verification", () => {
  for (const [name, call] of calls)
    for (const field of ["course", "releaseId", "releaseManifestHash"])
      test(`${name} propagates selection and rejects wrong ${field}`, async () => {
        let url = "";
        globalThis.fetch = mockFetch(async (input) => {
          url = String(input);
          return Response.json({
            ...selected,
            [field]:
              field === "releaseId"
                ? `r-${"c".repeat(64)}`
                : field === "releaseManifestHash"
                  ? "d".repeat(64)
                  : "10xdevs3",
            modules: [],
            lessons: [],
          });
        });
        expect(await call()).toMatchObject({ ok: false, code: "release_mismatch" });
        expect(new URL(url).searchParams.get("release")).toBe(selected.releaseId);
      });
  test("v3 catalog remains compatible without release fields", async () => {
    globalThis.fetch = mockFetch(async () =>
      Response.json({ course: "10xdevs3", modules: [], lessons: [] }),
    );
    expect(await fetchCatalog("10xdevs3", "token")).toMatchObject({
      ok: true,
      data: { course: "10xdevs3" },
    });
  });
  test("v4 cannot silently use a catalog missing release identity", async () => {
    globalThis.fetch = mockFetch(async () =>
      Response.json({ course: "10xdevs4", modules: [], lessons: [] }),
    );
    expect(await fetchCatalog("10xdevs4", "token")).toMatchObject({
      ok: false,
      code: "release_mismatch",
    });
  });
});
