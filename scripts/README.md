Deterministic checks live here — anything that must give the same answer twice does not belong in a prompt.

## e2e-hosted.js

Browser end-to-end check of the deployed dashboard (`npm run e2e`). Drives
the real page with system Chrome via Playwright through every interactive
affordance: map clicks, flag chips, keyboard selection, Escape/close, hash
deep links, marker source links, the dashboard-map.json payload, and both
themes. 36 checks; exits non-zero on any failure; screenshots go to the
gitignored `reports/e2e-shots/`.

- `E2E_BASE=http://127.0.0.1:8080/dashboard-map.html npm run e2e` — test a
  local build instead of the hosted site.
- `E2E_HEADED=1 npm run e2e` — watch it run (headed, slow-motion).

Its first run against production caught two real bugs the unit tests and
screenshot checks had both missed (PR #8) — that's why it's kept here.
