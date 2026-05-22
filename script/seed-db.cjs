/**
 * seed-db.cjs
 * Run at Render startup (before server starts) to copy the bundled SQLite
 * database to the persistent disk if it doesn't already exist there.
 */
const fs = require("fs");
const path = require("path");

const TARGET = process.env.DATABASE_PATH || "ha-news.db";
const SOURCE = path.join(__dirname, "..", "ha-news.db");

if (!fs.existsSync(TARGET)) {
  if (fs.existsSync(SOURCE)) {
    fs.mkdirSync(path.dirname(TARGET), { recursive: true });
    fs.copyFileSync(SOURCE, TARGET);
    console.log(`[seed-db] Copied ${SOURCE} → ${TARGET}`);
  } else {
    console.log("[seed-db] No source DB found — server will create a fresh one.");
  }
} else {
  console.log(`[seed-db] Database already exists at ${TARGET}, skipping seed.`);
}
