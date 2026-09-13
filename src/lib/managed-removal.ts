/** One deletion primitive for updates and profile cleanup. Never traverses directories. */
import { existsSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { dirname, relative, sep } from "node:path";
import { contentHash } from "./manifest";
import { assertProjectFilePath, assertProjectPath } from "./project-course";

export interface ManagedRemoval {
  name: string;
  path: string;
  action: "removed" | "preserved_local" | "unchanged";
  reason?: string;
  storedHash?: string;
  pruneRoot?: string;
}

export function planManagedRemoval(root: string, input: {
  name: string; path: string; storedHash?: string; protected?: boolean; config?: boolean; pruneRoot?: string;
}): ManagedRemoval {
  assertProjectFilePath(root, input.path);
  const base = { name: input.name, path: input.path, storedHash: input.storedHash, pruneRoot: input.pruneRoot };
  if (!existsSync(input.path)) return { ...base, action: "unchanged", reason: "already_missing" };
  if (input.protected) return { ...base, action: "preserved_local", reason: "still_owned" };
  if (input.config) return { ...base, action: "preserved_local", reason: "config_template" };
  if (!input.storedHash) return { ...base, action: "preserved_local", reason: "missing_baseline" };
  if (contentHash(readFileSync(input.path)) !== input.storedHash) return { ...base, action: "preserved_local", reason: "locally_modified" };
  return { ...base, action: "removed" };
}

export function executeManagedRemoval(root: string, plan: ManagedRemoval): ManagedRemoval {
  assertProjectFilePath(root, plan.path);
  if (plan.action !== "removed") return plan;
  // Recheck bytes immediately before removal; a conflict callback may have edited them.
  if (!existsSync(plan.path)) return { ...plan, action: "unchanged", reason: "already_missing" };
  if (!plan.storedHash || contentHash(readFileSync(plan.path)) !== plan.storedHash) return { ...plan, action: "preserved_local", reason: "locally_modified" };
  rmSync(plan.path);
  if (plan.pruneRoot) pruneEmptyParents(root, plan.path, plan.pruneRoot);
  return plan;
}

export function pruneEmptyParents(root: string, file: string, boundary: string): void {
  let dir = dirname(file);
  while (dir === boundary || (relative(boundary, dir) !== ".." && !relative(boundary, dir).startsWith(`..${sep}`))) {
    assertProjectPath(root, dir);
    try { rmdirSync(dir); }
    catch (error) {
      if (["ENOENT", "ENOTEMPTY", "EEXIST", "EACCES", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
      throw error;
    }
    if (dir === boundary) return;
    dir = dirname(dir);
  }
}
