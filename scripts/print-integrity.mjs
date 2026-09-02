import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await readFile(resolve(root, "dist/index.js"));
console.log(`sha256-${createHash("sha256").update(bundle).digest("base64")}`);
