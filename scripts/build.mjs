// Builds the deployable site into /dist.
// Source pages live in /images and only need a leading page number, e.g.
//   "05 — Product 01_ General Rotary Washing & Drying Machine.png"
//   "14 — SECTION — Industrial Part Drying Machine.png"
//   "page-07.jpg"
// Titles, chapters and the Chronicle are derived from those names.
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "images");
const OUT = path.join(ROOT, "dist");
const PAGE_WIDTH = 1400;
const THUMB_WIDTH = 320;
const EXT_RE = /\.(png|jpe?g|webp|avif)$/i;
const NAME_RE = /^(?:page[\s_-]*)?(\d{1,3})(?:\s*[—–-]+\s*|\s+|[_.]\s*)?(.*)$/i;

function cleanTitle(raw) {
  return raw
    .replace(/_\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();
}

function classify(title) {
  const section = title.match(/^SECTION\s*[—–:-]+\s*(.+)$/i);
  if (section) return { kind: "section", title: section[1].trim(), label: null };
  const product = title.match(/^Product\s+(\d+)\s*:\s*(.+)$/i);
  if (product) return { kind: "product", title: product[2].trim(), label: `Product ${product[1].padStart(2, "0")}` };
  return { kind: "chapter", title, label: null };
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    })
  );
  return results;
}

async function main() {
  if (!existsSync(SRC)) throw new Error("Missing /images folder.");

  const files = (await fs.readdir(SRC)).filter((f) => EXT_RE.test(f));
  const entries = [];
  const seen = new Map();
  for (const file of files) {
    const base = file.replace(EXT_RE, "");
    const m = base.match(NAME_RE);
    if (!m) {
      console.warn(`  skipped (no leading page number): ${file}`);
      continue;
    }
    const n = parseInt(m[1], 10);
    if (seen.has(n)) throw new Error(`Page ${n} appears twice: "${seen.get(n)}" and "${file}"`);
    seen.set(n, file);
    entries.push({ n, file, raw: cleanTitle(m[2] || "") });
  }
  if (!entries.length) throw new Error("No catalogue pages found in /images.");
  entries.sort((a, b) => a.n - b.n);

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, "pages"), { recursive: true });
  await fs.mkdir(path.join(OUT, "thumbs"), { recursive: true });

  const pages = await pool(entries, 4, async (entry, i) => {
    const input = path.join(SRC, entry.file);
    const buf = await fs.readFile(input);
    const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
    const num = String(i + 1).padStart(2, "0");
    const pageName = `pages/${num}-${hash}.webp`;
    const thumbName = `thumbs/${num}-${hash}.webp`;

    const page = await sharp(buf)
      .resize({ width: PAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: 90, effort: 5 })
      .toFile(path.join(OUT, pageName));
    await sharp(buf)
      .resize({ width: THUMB_WIDTH })
      .webp({ quality: 76, effort: 5 })
      .toFile(path.join(OUT, thumbName));

    const info = classify(entry.raw || `Page ${i + 1}`);
    return { n: i + 1, ...info, src: pageName, thumb: thumbName, w: page.width, h: page.height };
  });

  // A titled page that leads straight into products is a chapter opener.
  pages.forEach((p, i) => {
    if (p.kind === "chapter" && pages[i + 1] && pages[i + 1].kind === "product") p.kind = "section";
  });
  let currentSection = null;
  pages.forEach((p) => {
    if (p.kind === "section") currentSection = p.title;
    p.section = p.kind === "product" ? currentSection : null;
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: pages.length,
    ratio: +(pages[0].w / pages[0].h).toFixed(5),
    pages
  };
  await fs.writeFile(path.join(OUT, "pages.json"), JSON.stringify(manifest, null, 2));

  // Social preview: cover + contents side by side.
  const ogH = 540;
  const ogPages = pages.slice(0, 2);
  const tiles = await Promise.all(
    ogPages.map((p) => sharp(path.join(OUT, p.src)).resize({ height: ogH }).png().toBuffer({ resolveWithObject: true }))
  );
  const gap = 10;
  const totalW = tiles.reduce((s, t) => s + t.info.width, 0) + gap * (tiles.length - 1);
  let left = Math.round((1200 - totalW) / 2);
  const composites = tiles.map((t) => {
    const c = { input: t.data, left, top: 45 };
    left += t.info.width + gap;
    return c;
  });
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#E4E8E1" } })
    .composite(composites)
    .jpeg({ quality: 86 })
    .toFile(path.join(OUT, "og.jpg"));

  // Static files.
  for (const item of ["assets", "favicon.svg", "apple-touch-icon.png"]) {
    const from = path.join(ROOT, item);
    if (existsSync(from)) await fs.cp(from, path.join(OUT, item), { recursive: true });
  }

  const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  const data = JSON.stringify({ ratio: manifest.ratio, pages }).replace(/</g, "\\u003c");
  let html = await fs.readFile(path.join(ROOT, "index.html"), "utf8");
  html = html
    .replace("<!--CATALOGUE_DATA-->", `<script>window.__CATALOGUE__=${data};</script>`)
    .replaceAll("%OG_IMAGE%", siteUrl ? `${siteUrl}/og.jpg` : "og.jpg")
    .replaceAll("%SITE_URL%", siteUrl || "");
  await fs.writeFile(path.join(OUT, "index.html"), html);

  const sections = pages.filter((p) => p.kind === "section").length;
  const products = pages.filter((p) => p.kind === "product").length;
  console.log(`Built ${pages.length} pages (${sections} chapters, ${products} products) into dist/`);
}

main().catch((err) => {
  console.error(`Build failed: ${err.message}`);
  process.exit(1);
});
