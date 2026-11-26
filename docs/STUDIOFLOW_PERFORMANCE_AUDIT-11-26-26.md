# StudioFlow performance audit

Baseline commit `826eba7`. Measurements compare local production builds in headless Chrome 157. The browser fixture used 48 packages, 12 gallery images on one package, and 1,200 pending registrations. It applied 350 ms to each of the three concurrent payment hydration requests. Desktop ran at 1440 × 900 with normal CPU speed. Tablet and phone ran at 768 × 1024 and 390 × 844 with 4× Chromium CPU throttling. The catalog and records were synthetic, and the image files were small fixture images.

## Findings and changes

| Area | Root cause | Change |
| --- | --- | --- |
| Cashier payment | The click handler waited for the registration, payments, and refunds before mounting the dialog. Closing or replacing an in-flight request had no dialog-level lifecycle. | Mount the payment frame on click. Render editable controls only after fresh data arrives. Keep the same dialog and close control through loading, failure, retry, and readiness. Abort superseded or dismissed reads. Payment and discount validation still use the hydrated record and the server-confirmed version. |
| Cashier edit | Opening the form requested eligibility for every pending client and loaded studio settings and session types a second time. The loading frame changed size and replayed the entry animation when the form loaded. | Get eligibility for one ID using the existing server predicate. Reuse the cashier station's live session types, skip the unused settings reads for school edits, and cancel dismissed requests. Reserve the form's dimensions and run the animation once. The server checks eligibility and version again on save. |
| Shared and custom overlays | Large overlays applied backdrop blur to the page and animated the viewport-sized layer. The permanent animation transform could also affect nested fixed content. | Keep the studio tint and animate the dialog panel. Remove the blur and persistent transform. Honor reduced motion. Contain overscroll in the shared modal and the payment dialog. |
| Kiosk package browser | Each scroll event walked the cards' DOM geometry. Position updates also recreated the card elements. | Calculate the active card from scroll position and geometry recorded during resize. Keep card elements stable as the indicator changes and reuse package summaries for cards and comparison. Preserve snap and arrow targets. |
| Package comparison | The dialog recalculated summaries, checked every package for each displayed line, and recomputed differences for each scalar cell. | Count normalized lines once per row and calculate the difference flag once per scalar row. Keep the sticky headings and every package column. |
| Cashier and Clients Directory filters | Internal scrolling reached the window capture listener and remeasured the panel even though its position did not move. | Ignore scrolling inside the filter and coalesce viewport measurements into one animation frame. Cancel pending measurements on close. |
| Admin overview and settlement ledger | Both sets of calculations ran regardless of the selected view. Refund grouping also copied an expanding array for each refund. | Calculate overview and ledger datasets where they are used. Group refunds in one pass. Preserve audit formulas, exports, and the current ledger account. |
| Kiosk startup and workflow data | Initial navigation loaded staff modules eagerly. The initial workflow request waited for the same 120 ms debounce used to combine later live updates. | Load staff modules on entry to their routes. Start workflow reads immediately and retain the debounce on follow-up refreshes. Abort outstanding reads when the consumer changes or unmounts. |

## Measurements

Payment timings are the median of five openings per viewport. Visibility uses the first animation-frame sample where the dialog panel is visible. Readiness is when the form is present and can accept input. Comparison used one opening per viewport. The scroll test requested eight consecutive smooth snap positions and sampled animation-frame intervals for 1.85 seconds. Late intervals exceeded 25 ms. Long tasks lasted at least 50 ms.

| Viewport | Payment visible | Payment ready | Compare visible | Carousel p95 frame interval | Carousel late intervals | Carousel long tasks |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop | 391 ms → 26 ms | 376 ms → 375 ms | 101 ms → 53 ms | 16.9 ms → 16.8 ms | 0 → 3 | 0 → 0 |
| Tablet | 570 ms → 137 ms | 456 ms → 456 ms | 631 ms → 478 ms | 150.1 ms → 33.3 ms | 16 → 9 | 10 → 0 |
| Phone | 596 ms → 78 ms | 486 ms → 442 ms | 645 ms → 526 ms | 116.4 ms → 33.3 ms | 18 → 10 | 8 → 0 |

- Initial kiosk JavaScript fell from 1,266,334 to 452,062 decoded bytes, or 364,202 to 139,514 bytes using gzip on the local assets. Module requests increased from 4 to 6 with route splitting.
- The carousel made 52 instrumented card or track rectangle reads on each baseline viewport and zero after the change. Each run ended at package 9 of 48. The measured document contained 2,328 elements before and 2,330 after.
- The eligibility response for opening one editor went from 21,601 to 19 bytes. Its extra settings and session-type reads went from 2 to 0. Payment hydration used three requests before and after.
- With Advanced Filters open at desktop width, 24 synthetic nested scroll events caused 24 panel rectangle reads before and 0 after.
- Payment and edit panels had identical bounding rectangles before and after hydration at each tested viewport. The editor did not replay its entrance animation.

## Coverage and limits

I reviewed shared and custom modal entry points across registration, cashier, admin, photography, makeup, chooser, cameras, and receipts. The code audit covered page and nested scrolling, horizontal snap tracks, paginated tables, expanded histories, photo galleries, and analytics. Receipt and PDF exports already load their large libraries on demand. The shoot gallery already loads protected photos near the viewport and revokes its object URLs. The common tables paginate by default, and the station carousels use native scrolling.

The initial audit also found full-dataset requests on cashier and admin refresh, per-client ledger histories, large DOM trees in unpaginated queue and catalog surfaces, and full-resolution downloads when staff browse shoot photos. The 48-column comparison still took about half a second to appear in the throttled tests. Profile real catalog sizes and camera files on an in-studio tablet before deciding whether to limit rendered rows, defer comparison columns, or generate shoot thumbnails. Physical display presentation, touch hardware, production LAN timing, React component render counts, long-session heap retention, and a full visual or assistive-technology comparison were outside the measured coverage.

## Verification

- TypeScript, ESLint, and the production Vite build passed. The build used a temporary output directory and emitted Vite's chunk-size advisory for the on-demand ExcelJS chunk.
- PocketBase workflow integration passed 11 tests, including eligibility by client ID, edit permissions, stale revisions, payment confirmation, and idempotent replay. Catalog integration passed 25 tests. The data-table model suite passed three tests for expansion, sort, and pagination.
- Browser checks passed at all three viewport sizes for payment loading, failure, retry, dismissal during loading, cash validation, cashier edit loading, pagination, package comparison, gallery expansion and Escape dismissal, overview scrolling, and ledger search and account dialogs. The ledger also scrolled horizontally at the smaller viewports. The browser exercised the UI against synthetic API responses, and the PocketBase suite exercised persistence, permissions, and station workflows.

## Modified files

- App and shared data hooks — `src/App.tsx`, `src/hooks/useWorkflowData.ts`, `src/hooks/useStudioSettings.ts`.
- Shared dialogs — `src/index.css`, `src/components/common/Modal.tsx`, `src/components/common/ConfirmModal.tsx`.
- Registration — `src/features/registration/components/PackageSelectionSection.tsx`, `src/features/registration/components/PackageCompareModal.tsx`, `src/features/registration/components/PackageDetailsModal.tsx`.
- Cashier — `src/features/cashier/CashierPage.tsx`, `src/features/cashier/useCashierState.ts`, `src/features/cashier/components/PaymentModal.tsx`, `src/features/cashier/components/CashierRegistrationEditor.tsx`, `src/features/cashier/components/NotifyPickupModal.tsx`, `src/features/cashier/components/ReleaseDeliverableModal.tsx`.
- Admin — `src/features/admin/components/AdminAnalyticsTab.tsx`, `src/features/admin/components/CatalogItemsPanel.tsx`, `src/features/admin/components/EditStudentModal.tsx`, `src/features/admin/components/LedgerActionModals.tsx`, `src/features/admin/components/ResetPasswordModal.tsx`, `src/features/admin/components/StudentDirectoryFilters.tsx`.
- PocketBase and integration coverage — `pb_hooks/studio_cashier_edits.pb.js`, `scripts/test-studio-workflow.cjs`.
