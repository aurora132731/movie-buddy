/**
 * Downloads official posters into /posters so Vercel serves them as static files.
 * Run: node scripts/sync-posters.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const root = path.join(__dirname, "..");
const sources = JSON.parse(fs.readFileSync(path.join(root, "posters.json"), "utf8"));
const outDir = path.join(root, "posters");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, { headers: { "User-Agent": "MovieBuddy/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBuffer(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

(async () => {
  let ok = 0;
  let fail = 0;

  for (const [id, url] of Object.entries(sources)) {
    const ext = url.includes(".png") ? "png" : "jpg";
    const filePath = path.join(outDir, `${id}.${ext}`);
    try {
      const buffer = await fetchBuffer(url);
      if (buffer.length < 2000) {
        throw new Error("file too small");
      }
      fs.writeFileSync(filePath, buffer);
      console.log("OK", id, buffer.length);
      ok += 1;
    } catch (error) {
      console.log("FAIL", id, error.message);
      fail += 1;
    }
  }

  const manifest = {};
  fs.readdirSync(outDir).forEach((name) => {
    if (/\.(jpg|jpeg|png|webp)$/i.test(name)) {
      const id = name.replace(/\.[^.]+$/, "");
      manifest[id] = `/posters/${name}`;
    }
  });
  fs.writeFileSync(path.join(root, "posters-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Done: ${ok} saved, ${fail} failed`);
})();
