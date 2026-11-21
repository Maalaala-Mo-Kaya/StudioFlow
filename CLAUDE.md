# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StudioFlow V2: an offline, LAN-only workflow system for graduation pictorial studios (Windows). A React 19 + TypeScript + Tailwind v4 SPA (Vite, React Compiler via Babel) talks to a bundled **PocketBase 0.41** server (`pocketbase.exe`), which holds all data, auth, and server-side business logic in JS hooks. There is no separate Node backend. `docs/referrence*.md` are original planning specs (they mention a Node backend that was never built), so don't treat them as describing the current code.

## Commands

```bash
# Backend (dev): uses ./pb_data, ./pb_hooks, ./pb_migrations
./pocketbase.exe serve --http="127.0.0.1:8090"
# Frontend dev server with HMR on :5173 (talks to PocketBase on <hostname>:8090)
npm run dev

npm run typecheck      # tsc on tsconfig.app.json (src) and tsconfig.node.json (vite config)
npm run build          # typecheck + vite build -> dist/
npm run lint           # eslint (ts/tsx only; pb_hooks/migrations are not linted)
npm run test:workflow  # PocketBase integration test (needs Node 22.13+ for node:sqlite)
npm run test:catalog   # catalog import: parser + saving drafts into a throwaway PocketBase (app TS loaded via Vite runnerImport)
npm run check:excel    # Excel math check: builds every export from a temp server on :8099 and recalculates it (-- --verbose)
npm run deploy         # build + copy dist/ into pb_public/ (single-port serving on :8090)

run.bat                # production launcher: detects LAN IP, serves on 0.0.0.0:8090
run.bat --build        # scripts/build.bat + scripts/deploy.bat, then serve
scripts\reset-for-handover.bat  # wipe test data before handover (server must be stopped; backs up first)
```

`scripts/check-excel-math.mjs` loads the app's export code through Vite's `runnerImport`, creates every money case through the real API, and recalculates each workbook with HyperFormula (dev dependency, GPL-3.0, never shipped). Run it after changing `studentExcel.ts`, `auditWorkbook.ts`, `auditData.ts` or the ledger hooks.

There is no unit-test framework. `scripts/test-studio-workflow.cjs` is a single `node:test` that starts a throwaway PocketBase instance in a temp dir (its own `--dir`, plus the repo's `pb_hooks` and `pb_migrations`, with `STUDIOFLOW_PHOTOS_ROOT` pointed at a temp photo root) and runs the whole staff workflow against real folders. It first migrates up to the schema before `1793801600` and seeds legacy data, then applies the remaining migrations to test an in-place upgrade. Set `POCKETBASE_TEST_BINARY` to use a different PocketBase binary. When you add a migration that changes existing data, extend this test.

`pb_data/` (the live SQLite DB) and `pb_public/` (deployed build) are gitignored and generated. `pb_data/types.d.ts` provides PocketBase JSVM typings for hooks and migrations.

## Architecture

### Frontend (`src/`)
- **Routing is hash-based with no router library.** `useHashNavigation` sets `currentTab` (`register`, `login`, `cashier`, `photographer`, `mua`, `chooser`, `admin`). `App.tsx` renders one station page per tab, wrapped in `RoleLoginGate allowedRoles=[...]`. `register` is the public kiosk.
- **`src/db/pocketbase.ts`** holds the single `pb` client. With no `VITE_PB_URL` set, it uses `window.location.origin` on port 8090 and otherwise `<hostname>:8090`, so the same build works on any LAN device. Auto-cancellation is disabled globally because many components query at the same time.
- `src/features/<station>/` holds each page, its `components/`, and a state hook (`useCashierState`, `usePhotographerQueue`, `useRegistrationForm`, `useAdminData`).
- There are two data-access styles:
  - Cashier, registration, and most admin views use `pb.collection(...)` directly, relying on collection API rules.
  - MUA, chooser, and some admin views use **custom endpoints under `/api/studioflow/*`** through `useWorkflowData(path)` (`src/hooks/useWorkflowData.ts`). It fetches with `pb.send`, polls every 8s, and also refetches when the `studioflow-workflow` realtime topic fires.
- `src/constants/studio.ts` is the single source for branding, contact info, receipt numbering, and terms clauses. `src/types/index.ts` defines the shared record types.
- **Theme (Night/Day luxury gold), defined in `src/index.css`:**
  - Night is the default. Day is `<html data-theme="light">`, set by `ThemeToggle` in the navbar and stored per device in `localStorage['studioflow-theme']`. A script in `index.html` applies it before first paint.
  - Use the semantic Tailwind colors (`bg-canvas`, `bg-panel`, `bg-obsidian`/`bg-obsidian-2`, `text-ink`, `border-line`, `text-gold`/`gold-soft`/`gold-bright`, `bg-gold-wash`, `text-on-gold` for text on solid gold) and `shadow-lux`/`shadow-lux-gold`, not hex values.
  - "Obsidian" is a black band in Night and champagne in Day. `.theme-night` keeps a region dark in both modes (navbar, footer, photo viewer).
  - The neutral, red, emerald, amber and blue palettes (and `white`) are re-mapped per surface through CSS variables, in three blocks: DARK, INVERTED and ORIGINAL. Their order in the file matters.
  - `.theme-paper` (used on the printed sheets and `SignaturePad`) and `@media print` restore the light palette, so printed receipts stay unchanged. The sheets in `src/features/receipts/` deliberately keep literal hex colors.
- **Printed forms (`src/features/receipts/`):**
  - `JobOrderSheet` is a letter page cut crosswise: claim stub on top, studio copy below. It prints for the first payment.
  - `PaymentReceiptSheet` is an 8.5 × 3.67 in strip (`RECEIPT_HEIGHT_IN`, a third of a letter sheet) cut lengthwise into customer and studio copies. It prints for every later payment (`printModeFor`).
  - A cancelled or fully refunded job order prints with a stamp (`jobOrderMarks` in `receiptData.ts`). The admin directory's PDF (`downloadJobOrderPdfFor`) appends the order's refund slips, 3 per page.
  - `RefundSlipSheet` uses the same strip for a refund (`PrintRefundSlipModal`, opened after a refund is recorded and from the ledger's Print Slip button). The client signs the studio copy, on paper or on screen (`POST /api/studioflow/refunds/:id/signature`: admin only, saved once with `signed_at` / `signed_witness`; `signature` is a protected file, read with a file token via `loadRefundSignature`). Its figures come from `refundFigures` in `receiptData.ts`, as of the refund's time.
  - By default the receipt prints on the top third of a letter page, so the rest of the sheet can be reused. The `half` paper option ("Leftover piece") prints onto a leftover piece; the choice is saved per device in `localStorage['studioflow-receipt-paper']`.
  - The forms deliberately avoid solid fills, to save ink.
  - `PrintReceiptModal` portals the sheet into `body` as `.sf-print-root`, sets `@page` size for the form, and `index.css` hides everything else when printing.
  - `receiptPdf.ts` redraws the same layouts with jsPDF. html2canvas can't parse Tailwind v4's oklch colors.
  - Headings (`h1`–`h3`) use Cinzel from `@fontsource-variable/cinzel`, bundled locally so it works offline.
- **Money figures in Admin → Analytics** (cards, school / package lists, balance banner, Audit Export workbook in `auditWorkbook.ts`, header CSV) all come from `buildAudit` in `src/features/admin/auditData.ts`. Change the rules there only.
- **Catalog import** (Admin → Packages & Add-ons → Import from File, `AdminCatalogImportTab`): reads a flyer photo (tesseract.js OCR), `.xlsx`/`.csv` (exceljs), `.docx` (mammoth) or `.txt` into draft packages / add-ons for the admin to review, then `handleImportCatalog` creates them active (`saveCatalogDrafts` in `saveCatalog.ts`). Package and add-on codes are unique ignoring case (add-ons may have none): `checkCatalogPrice` in `registration_billing.pb.js` trims them and refuses a code in use, and the unique indexes `idx_packages_code` / `idx_add_ons_code` catch racing saves. Parsing rules live in `src/features/admin/catalogImport/catalogParser.ts`; OCR preprocessing and multi-pass merging in `readCatalogSource.ts`. The OCR engine and English model are served offline from `public/ocr/`, which `scripts/copy-ocr-assets.cjs` generates from node_modules on `predev` / `prebuild` (gitignored).
- Heavy export libraries (exceljs, jspdf, html2canvas) are loaded with dynamic `import()` in `studentExcel.ts`, `muaPerformanceExport.ts`, `downloadBlob.ts`, and `features/receipts/receiptPdf.ts`. Keep them lazy.

### Backend (`pb_hooks/`, `pb_migrations/`)
- **The server is authoritative for workflow and money.** `studio_registration.pb.js` resets every workflow/ledger field on kiosk creates. `registration_billing.pb.js` recomputes totals from the catalog. `registration_validation.pb.js` validates input. `job_order.pb.js` assigns the 5-digit job order number (inside a transaction; unique index `idx_registration_job_order_no`) and daily queue number, and names / creates the client's photo folder at the **first payment** (`assignFolder`: `<job no>_<Last>_<First>`, record ID appended only as a fallback). `studio_documents.pb.js` (`POST /api/studioflow/registrations/:id/documents`, cashier/admin) saves browser-drawn PDF copies into `<folder>/RECEIPTS/` under names checked against the database (`JO-<no>.pdf`, `OR-….pdf`, `RF-….pdf`); stations call `refreshClientDocuments` (`src/features/receipts/clientDocuments.ts`) after each payment, void, refund, signature, cancel, restore or edit. Never trust client-computed prices or status.
- `*.pb.js` files are auto-loaded by PocketBase and register hooks or routes (`routerAdd`, `onRecordCreateRequest`, ...). Files **without** `.pb` are shared CommonJS modules. Because of the PocketBase JSVM's isolated handler scopes, load them *inside each handler* with `require(__hooks + "/x.js")`:
  - `studio_workflow.js`: state predicates such as `photoQueue`, `photographyComplete`, and `makeupServices`, plus `staff(app, auth, roles)` for role checks.
  - `studio_pricing.js`: job order pricing (`priceAddOns`, `addOnCents`). Add-ons are catalog snapshots; ones already on an order keep the price they were sold at. `registration_billing.pb.js` uses it on create and on admin edits (package, add-ons, other fees), and recalculates the total there. Screens show the sold package price as total − add-ons − other fees (`soldPackagePrice`). `package_snapshot` also freezes the package's `inclusions`, `freebies` and `photo_selection_limit` at sale. Freebies (free frame, raw copies…) are a separate list on packages, cost nothing, and are trimmed by `checkCatalogPrice`; read a job order's with `orderFreebies` (orders sold before freebies existed have none). `applyAutoAddOn` keeps the automatic no-makeup add-on in step with an edited order; both registration update hooks call it, because `studio_registration.pb.js`'s update-request hook runs **before** `registration_billing.pb.js`'s.
  - `studio_photo_storage.js`: the photo folder layout under `STUDIOFLOW_PHOTOS_ROOT` (default `C:\StudioFlow_Photos`) and path sanitization.
  - `studio_photo_selection.js`: gallery and selection moves between the `selected/` and `unselected/` folders, using hard links (needs NTFS), with resumable transfers.
  - `studio_mua_reporting.js`: MUA completion logging and daily reports in Asia/Manila time (UTC+8).
  - `studio_camera_import.js`: camera hot-folder import. Each `camera_stations` record watches one server folder. While a client is linked (a session, started by Call Client on the Photo Floor), finished photos are claimed by renaming them into `<watch>/.studioflow-importing/<job id>/` (Windows refuses the rename while the file is still being written), then moved into the client's job folder (RAW files go to `RAW/`). Session fields are server-owned and written with SQL guarded by `scan_lock`. Scans run every 4s from an open Photo Floor and once a minute from cron. `STUDIOFLOW_IMPORT_COPY=1` forces the cross-drive copy path, for tests.
  - `studio_station_events.js`: `notify(app)` broadcasts a data-free `studioflow-workflow` invalidation. Call it after any workflow state change so station UIs refresh.
- **Client types:**
  - A registration is `client_kind` `school` (school / level / course required) or `walkin` (a `session_types` record; `on_location` sessions also need `event_date` and `event_venue`; optional `client_org`). Empty on old records means school.
  - The kiosk accepts a type only while its switch is on in `studio_settings` (single record `key = 'main'`: `school_enabled`, `walkin_enabled`, `walkin_terms`). The checks live in `registration_validation.pb.js`.
  - Packages have `client_kind` `school` | `walkin` | `both` (empty = school). Add-ons have the same field, but empty means **both** for them; `studio_pricing.js` refuses an add-on not offered to the client's type (kiosk and admin edits), and add-ons already on an order are kept. Walk-in photo folders are `WALK-IN/<YYYY-MM>/<job>_<name>`.
  - **Preferred makeup look** (`makeup_look` = `full` | `light` | `grooming`, `makeup_look_note`): required at the kiosk only when the order brings makeup (`purchasedServices`) and it is asked (`studio_settings.makeup_look_school` / `makeup_look_walkin`, not `makeup_look_off` on the client's organization / session type); otherwise cleared. Rules in `pb_hooks/studio_makeup_look.js`, values in `src/constants/makeupLook.ts`; shown on the MUA queue (`look`, `lookNote`).
  - Use `src/utils/clientInfo.ts` (`clientGroup` / `clientDetail` / `clientSummary`) instead of reading `expand.organization` / `expand.course` directly. Prints show the course code (BSCS), not the full name.
- The registration lifecycle runs through `status`, `payment_status`, `makeup_state`, and `photo_status` on `registrations`. Paid jobs that need makeup (`makeup_service` set) go to the MUA queue, and the rest go straight to the photo queue (see `photoQueue` in `studio_workflow.js`). `makeup_version` and `photo_revision` provide optimistic concurrency.
- **Business rules enforced in hooks** (mirrored in `src/utils/releaseReadiness.ts`):
  - **Release:** needs a zero balance, `shoot_completed`, and production marked ready (status `completed`/`ready_for_pickup`, or framing `framed`/`ready_for_pickup`), checked against the saved record. A release must set `status = 'released'` with a non-empty `claimed_by` (the cashier's Release step); setting only `framing_status = 'released'` is refused.
  - **Production & pickup** (`studio_production.pb.js`): admins set `framing_status` (the "production status", used for all orders, framed or not) for one or many orders via `POST /api/studioflow/production-status`; the main status follows (`ready_for_pickup`, or back to `done_shooting`). The server stamps `ready_at` when an order becomes ready; the cashier records client notices via `POST /api/studioflow/pickup-notified/:id`. Those fields are server-owned. `shoot_completed` is a hidden field, so the frontend uses `isPhotographed()` (derived from status).
  - **Admin edits of package / add-ons / fees:** refused on released and cancelled orders; a changed package must be active and offered to the client type. New makeup added before or during the shoot routes the client to the MUA queue (mid-shoot: status back to `paid`, `makeup_state` reset, queue number kept, linked camera unlinked by an after-update hook in `studio_camera_import.pb.js`); after the shoot it is refused. `logCompletion` credits only services not already logged for the job.
  - **Cancel / Restore:** only through `POST /api/studioflow/registrations/:id/cancel` (reason required; saves `status_before_cancel`, who, when) and `/restore` (back to `status_before_cancel`, except `paid` with nothing held left becomes `pending_payment`; the queue-guard trigger allows exactly the move back). The Overall Excel lists cancelled orders on their own CANCELLED sheet, not on the school sheets. Job orders with payments are never deleted. Cancelled orders take no new payments, owe nothing (`balance` 0), and keep `shoot_completed`. Released orders can't be cancelled.
  - **Voids and refunds** (`studio_ledger.pb.js`, rules in `studio_ledger.js`): a void (`POST /api/studioflow/payments/:id/void`, reason required) is permanent and keeps the row. A refund is a separate `refunds` record (`POST /api/studioflow/refunds`, RF-000001…, dated when given back, `client_key` for retries), allowed up to what a cancelled order holds or what an active order was overpaid. `paid_amount` is **net** (counted payments − refunds); `refunded_amount` is the refund total. Payments and refunds have no update/delete API rules, and `onRecordDelete` refuses deletes. The insert trigger counts refunds in the remaining balance.
  - **Payments:**
    - The server assigns `receipt_no` (`OR-000001`…) and computes `change_amount`, `balance_before` and `balance_after`.
    - Stations send a `client_key`, which is unique, so a retried request can't double-record. After a failure, they look the payment up by that key.
    - After save, only `status` and `remarks` may change.
  - **Studio day:** "today" means Asia/Manila (UTC+8). The daily queue number and the "Collected Today" figure both use Manila midnight.
- **Security model:** collection API rules restrict data by `@request.auth.role` (`admin`, `cashier`, `photographer`, `mua`, `chooser`) and `disabled = false`. Admin-only operations (deletes, pricing, rosters, exports) are enforced both in rules and in custom routes. Schema or rule changes go in a **new** timestamped migration in `pb_migrations/`. Never edit an applied one.
- Timestamps in migration filenames are large (`1793...`). Make new ones sort after the latest existing file.
