/** Applies pending migrations (same code path the app uses at boot). */
import { getDb } from "../src/lib/db";

getDb()
  .then(() => {
    console.log("Migrations applied.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
