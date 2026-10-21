/**
 * Renders the development base-model placeholders into /public/base-models.
 * Production replaces these PNGs with the reviewed photoreal library.
 *   pnpm seed:base-models
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { BASE_MODELS, DEFAULT_BACKDROP_ID } from "../src/lib/base-models/catalog";
import { renderBaseModelPng } from "../src/lib/base-models/render";

async function main() {
  const out = path.resolve("public/base-models");
  await fs.mkdir(out, { recursive: true });
  for (const model of BASE_MODELS) {
    const png = await renderBaseModelPng(model, DEFAULT_BACKDROP_ID, 432, 648);
    await fs.writeFile(path.join(out, `${model.id}.png`), png);
    process.stdout.write(".");
  }
  console.log(`\nRendered ${BASE_MODELS.length} base-model previews to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
