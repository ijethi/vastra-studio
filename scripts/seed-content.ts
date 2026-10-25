/**
 * Seeds the editable-content tables from the typed defaults:
 * base models (src/lib/base-models/catalog.ts), backdrops, credit packs
 * (src/lib/billing/packs.ts), reel scenes (src/lib/reels/scenes.ts) and the
 * app copy (src/lib/content/types.ts).
 *
 *   pnpm seed:content            # fill only the tables that are empty (what boot does)
 *   pnpm seed:content --force    # upsert every default row, overwriting admin edits by id
 *
 * Runs migrations first (same code path as boot). Needs --conditions=react-server
 * because the database module imports `server-only`; the package.json script sets it.
 */
import "./load-env";
import { getDb } from "../src/lib/db";
import { seedContent } from "../src/lib/content/store";

const force = process.argv.includes("--force");

getDb()
  .then((db) => seedContent(db, { force }))
  .then((report) => {
    const lines = Object.entries(report).map(([table, n]) => `  ${table.padEnd(12)} ${n}`);
    console.log(`${force ? "Upserted" : "Seeded (empty tables only)"}:\n${lines.join("\n")}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
