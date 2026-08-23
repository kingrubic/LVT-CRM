# Noto Sans Regular — attendance PDF font

- **Family:** Noto Sans
- **File:** `NotoSans-Regular.ttf` (static Regular TrueType)
- **Upstream:** https://github.com/notofonts/noto-fonts
- **Upstream path:** `hinted/ttf/NotoSans/NotoSans-Regular.ttf`
- **License:** SIL Open Font License 1.1 — see `OFL.txt`
- **Vendored:** 2026-08-23
- **Size:** 556 KiB TTF

jsPDF can embed TrueType bytes via `addFileToVFS` / `addFont`. This file is loaded from disk in tests and inlined by Vite at build time into the attendance-PDF chunk (not fetched from a CDN, system font, or runtime network).

`@fontsource-variable/montserrat` in this app is WOFF2-only and is **not** used for PDF generation.
