# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.0] - Initial Release

### Highlights
- Express static server serving `public/` on configurable `PORT` (default `5173`).
- Core features: upload KML/KMZ, auto-detection of ODC & feeder, ODP placement along feeder, material summary.
- Exports: KML/KMZ with styled layers (ODC, feeder, pole, ODP, distribution), PDF summary, and XLSX multi-sheet.

### Configurable Controls
- Feeder keyword filter, specific feeder name selection.
- ODC→feeder projection distance limit.
- ODP spacing along feeder.

### XLSX Sheets
- `Ringkasan`, `ODC`, `ODP`, `Distribusi`, `Feeder`.

### Deployment
- Node.js 20: `npm install --production` then `PORT=5173 node server.js`.
- Docker: build image and run on `5173`.

### Notes
- No build step required; served static assets from `public/`.
- Geodesic length calculations using Turf for feeder and distribution.

[v1.0.0]: https://github.com/erlangh/ftth-kalkulator/releases/tag/v1.0.0