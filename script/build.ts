import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile, copyFile, access } from "node:fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

async function copyStaticData() {
  // Slim articles.json to 50 most recent for faster static load
  try {
    const raw = JSON.parse(await readFile("articles.json", "utf8"));
    const slim = { ...raw, articles: raw.articles.slice(0, 50), total: raw.total, slimmed: true };
    await writeFile("dist/public/articles.json", JSON.stringify(slim));
    console.log(`slimmed articles.json -> dist/public/articles.json (50 of ${raw.total})`);
  } catch (e) { console.warn("articles.json not found, skipping"); }

  for (const file of ["stocks.json", "weekly_news.json"]) {
    try {
      await access(file);
      await copyFile(file, `dist/public/${file}`);
      console.log(`copied ${file} -> dist/public/${file}`);
    } catch {
      console.log(`no ${file} found, skipping copy`);
    }
  }
}

buildAll()
  .then(copyStaticData)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
