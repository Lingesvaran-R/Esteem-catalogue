# Esteem Multi Systems — Catalogue Flipbook

Interactive digital catalogue for Esteem Multi Systems (Chennai, est. 2009) —
a hero landing section followed by a realistic double-page flipbook of the
product catalogue.

Live: deployed via Vercel from this repository's `main` branch.

## Updating the catalogue

The page count is detected automatically at load time — there is nothing to
edit in the code for a normal update:

1. Export/replace the catalogue pages as JPGs named `page-01.jpg`,
   `page-02.jpg`, … sequentially, no gaps, in `/images`.
2. Commit and push to `main`. Vercel redeploys automatically.

If you only have a PDF, the scripts in `/tools` (Windows PowerShell, no
extra installs required) will rasterize it to `/images`:

```powershell
# Render pages from a PDF to full-resolution PNGs
powershell -ExecutionPolicy Bypass -File tools/render-pages.ps1 -PdfPath "your-catalogue.pdf" -OutDir images

# Compress the rendered PNGs to web-sized JPGs (deletes the PNGs)
powershell -ExecutionPolicy Bypass -File tools/compress-pages.ps1 -InDir images
```

## Structure

- `index.html` — hero section + flipbook markup
- `assets/css/style.css` — theme, layout, book/page styling
- `assets/js/app.js` — page detection/preload, flipbook init (page-flip.js),
  table of contents, zoom, fullscreen, enquiry link
- `images/page-NN.jpg` — catalogue pages
- `tools/` — one-off PDF → image conversion scripts (Windows PowerShell)
