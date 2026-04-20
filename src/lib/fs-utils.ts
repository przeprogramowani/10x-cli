import { readFileSync } from "node:fs";

/** Read a UTF-8 file; return null if reading fails (missing, unreadable, etc.). */
export function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
