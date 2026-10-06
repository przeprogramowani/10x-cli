/**
 * Records the newest 10x-toolkit release the project's course received in the
 * project manifest after a successful pull, so `10x changelog` has a
 * per-project baseline.
 *
 * Best-effort by contract: any failure (older backend without the route,
 * network, empty list, invalid response, unreadable manifest) leaves the
 * manifest untouched and never changes the calling command's output or exit
 * code. Only `--verbose` mentions it.
 */

import { fetchChangelog } from "./api-content";
import { clearToolkitVersion, readManifest, recordToolkitVersion } from "./manifest";
import { type OutputContext, verbose } from "./output";

export async function recordLatestToolkitVersion(
  ctx: OutputContext,
  token: string,
  manifestDir: string,
  course: string,
  now: () => Date = () => new Date(),
): Promise<void> {
  try {
    // No manifest → nothing to record into; skip the request entirely.
    if (!readManifest(manifestDir)) return;
    // The newest release this project's course received, not the account's.
    const result = await fetchChangelog(token, { limit: 1, course });
    if (!result.ok) {
      verbose(ctx, `toolkit version not recorded: ${result.code}`);
      return;
    }
    const latest = result.data.entries[0];
    if (!latest) {
      // The course has no release to record. A version stored before records
      // were course-scoped (an account-wide one) would misstate the project.
      if (clearToolkitVersion(manifestDir)) verbose(ctx, `cleared toolkit version: no ${course} releases`);
      else verbose(ctx, "toolkit version not recorded: no changelog entries");
      return;
    }
    if (recordToolkitVersion(manifestDir, latest.version, now())) verbose(ctx, `recorded toolkit ${latest.version}`);
  } catch (error) {
    verbose(ctx, `toolkit version not recorded: ${error instanceof Error ? error.message : String(error)}`);
  }
}
