const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const base = [...JSON.parse(fs.readFileSync(path.join(root, "movies.json"), "utf8"))];
const extra = JSON.parse(fs.readFileSync(path.join(root, "movies-extra.json"), "utf8"));
const byId = new Map();
[...base, ...extra].forEach((movie) => byId.set(movie.id, movie));
const movies = [...byId.values()];

const manifest = fs.existsSync(path.join(root, "posters-manifest.json"))
  ? JSON.parse(fs.readFileSync(path.join(root, "posters-manifest.json"), "utf8"))
  : {};

let missing = 0;
movies.forEach((movie) => {
  const file = manifest[movie.id];
  const disk = file ? path.join(root, file.replace(/^\//, "")) : null;
  const ok = disk && fs.existsSync(disk) && fs.statSync(disk).size > 2000;
  if (!ok) {
    console.log("MISSING", movie.id, file || "(no manifest entry)");
    missing += 1;
  }
});

if (missing === 0) {
  console.log(`OK: all ${movies.length} posters present on disk.`);
} else {
  console.log(`Fix: run "node scripts/sync-posters.js" (${missing} missing)`);
  process.exit(1);
}
