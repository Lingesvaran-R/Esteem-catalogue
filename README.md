# Esteem Multi Systems — Interactive Catalogue

A premium, shareable catalogue page for Esteem Multi Systems (Chennai, est.
2009): a short intro followed by a realistic page-turning book with a
Chronicle chapter index, in-book zoom, page sound and enquiry links.

Deployed on Cloudflare Workers (`wrangler.jsonc`, serving `dist/`) — every push to `main` rebuilds and redeploys automatically. `vercel.json` is kept so the same repo also deploys on Vercel.

## Updating the catalogue

Only the `/images` folder needs to change.

1. Put the page images in `/images`. Each file name must **start with its page
   number**. Anything after the number becomes the page title:

   | File name | Shown as |
   | --- | --- |
   | `01 — Cover.png` | Cover |
   | `14 — SECTION — Industrial Part Drying Machine.png` | Chapter opener |
   | `15 — Product 10_ Centrifugal Drying Machine.png` | Product 10: Centrifugal Drying Machine |
   | `page-07.jpg` | Page 7 |

   `SECTION —` starts a new chapter in the Chronicle, `Product NN_` marks a
   machine (`_` stands in for `:`, which Windows does not allow in file
   names). PNG, JPG, WebP and AVIF all work.
2. Commit and push. Vercel runs `npm run build`, which optimises the images,
   builds the Chronicle from the file names and publishes the site.

## Local preview

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Structure

- `images/` — source catalogue pages (the only thing to edit for updates)
- `index.html`, `assets/` — page markup, styles, scripts, logos
- `scripts/build.mjs` — generates `dist/` (optimised pages, thumbnails,
  chapter data, social preview image)
- `tools/` — optional Windows helpers (PDF → images, logo variants)
