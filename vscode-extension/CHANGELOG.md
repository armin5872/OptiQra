# Changelog

## 1.0.0

- Image analyzer: `srcset`-only WebP/AVIF variants are now detected and network-checked (previously the parsing existed but was never wired in, so `<picture>`/`srcset`-served modern formats went unrecognized and unchecked).
- Image analyzer: the first couple of images on a page (the likely LCP candidate) are no longer flagged for missing `loading="lazy"` — and are now flagged instead if they incorrectly *do* have it, since lazy-loading the LCP image can hurt load performance.

## 0.1.0

Initial release — offline SEO/GEO/AEO/accessibility/security/performance/conversion/structured-data auditing, live diagnostics, quick fixes (automated + OPCA/AI with approval), Dashboard, 2D/3D Crawl Tree, offline Wiki, and native VS Code integration (Activity Bar, Issues tree, status bar, Settings UI).
