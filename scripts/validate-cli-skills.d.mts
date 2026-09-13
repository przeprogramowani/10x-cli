export function validateCliSkills(
  repoRoot: string,
  options?: { packedPaths?: ReadonlySet<string> },
): Array<{ name: string; files: number }>;

export function readPackedPaths(
  root: string,
  options?: {
    platform?: NodeJS.Platform;
    run?: (
      command: string,
      args: string[],
      options: { cwd: string; encoding: "utf8"; stdio: ["ignore", "pipe", "pipe"] },
    ) => string;
  },
): Set<string>;
