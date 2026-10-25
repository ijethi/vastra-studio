/**
 * Loads `.env.local` then `.env` into process.env for the standalone scripts
 * (migrate, seed, worker), the way `next dev` does for the app. Values already
 * present in the environment win. No dotenv dependency: the format is
 * KEY=value, optional quotes, `#` comments.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

for (const file of [".env.local", ".env"]) {
  let text: string;
  try {
    text = readFileSync(path.resolve(process.cwd(), file), "utf8");
  } catch {
    continue;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
