import { resolve } from "node:path";
import { helperInstallContract } from "./helpers/helper-install-contract";

helperInstallContract("bundled helper install (real CLI source)", () => [process.execPath, resolve(import.meta.dir, "../src/index.ts")]);
