# TODO

## TRAVEL GOGO

### Done

- Owner-only public/private Trip control backed by visibility-aware RLS and `tg_set_trip_visibility`
- Supabase Phase 3 role-aware controls and owner-only shared-editor management
- Supabase Phase 2 Google Auth, SSR session refresh, and Supabase repository integration
- Supabase Phase 1 schema and RLS migration for isolated `tg_*` tables
- Core trip notebook using centralized localStorage repository
- Versioned localStorage schema with Supabase-ready timestamps and ownership fields
- Shared TravelItem data for Daily, Places, Food, and Outline
- Optional business hours with device-local status calculation
- Same-day Daily itinerary drag-and-drop with long-press mobile activation
- Responsive card/list UI using the existing design system
- Multi-entry flight and hotel details in Outline using independent versioned localStorage repositories

### Future

- Add one-time localStorage migration/import flow (Phase 4)
- Add drag-and-drop itinerary ordering

## Done

- CSV Export Cleanup (Phase 5A-2) — CSV export (only) now includes just the user-facing fields (店家/類別/優惠內容/日期/分數/官方網址/備註/標籤) in that order, with Traditional Chinese headers and a UTF-8 BOM; JSON/XLSX export, import, and the export button are untouched
- Admin Table Layout (Phase 5A-1) — Desktop Admin Rewards table reordered to match the frontend table (Store/Category/Content/Date/Score) with a new single-line, ellipsis-truncated Content column, and Edit/Delete split into separate fixed-width columns; column proportions approximate the frontend table via `sm:table-fixed` + colgroup; mobile layout unchanged from Phase 4A; no changes to search/sort/pagination/selection/bulk delete/backend/schema
- Homepage UX Polish (Phase 4E, mobile-only refinement) — Mobile Favorite column narrowed 56px→44px, with the freed width handed to Store (the only other unconstrained visible mobile column) — shifts the whole Favorite column further right without moving the heart icon within its own column; header/icon stay centered via the same symmetric padding as before; Desktop unchanged, still 56px
- Homepage UX Polish (Phase 4E, rendering fixes) — Fixed the actual rendering bugs behind two remaining visual concerns, following a table-layout specification review (widths kept as agreed: Store 136 / Category 80 / Content flexible / Date 72 / Rating 72 / Favorite 56 / Used 56): Store's text wrapper had `md:flex-none`, which silently defeated its `truncate` ellipsis and let long names render past the 136px column instead of clipping to it — switched to `flex-1 min-w-0` at every breakpoint so the rendered width now matches the column; removed a hardcoded mobile `pr-2` on the content preview and gave Favorite its own compact padding (was inheriting the shared default), which together were stacking into unnecessary empty space between the content and the heart icon; Favorite's width synced to the agreed 56px; table `min-w` recalculated to 682px; no functional changes
- Homepage UX Polish (Phase 4E, mockup alignment) — Desktop table matched to the provided reference mockup's layout/proportions: Store switched from a `min-width` floor to a true fixed 136px width (mockup's explicit "fixed smaller width" direction); Category/Date/Rating/Used widths trimmed (80/72/72/56px) to give more freed space to Reward Content, which was already unconstrained and is now even more clearly the dominant column (~50%, matching the mockup); Favorite kept at 64px; alignment (Store/Content left, rest centered with header/content on the same center line) and icon-only Used already matched from the prior pass; table `min-w` recalculated to 690px; Phase 4E now matches the reference mockup; no functional changes
- Homepage UX Polish (Phase 4E, final polish) — Desktop table: Store `min-width` reduced 144px→136px, giving more room to Reward Content (the primary information on the site); removed Favorite's custom padding override so it shares the same default padding as other columns, centering handled purely by fixed width + `text-center`; fixed the real bug behind both the desktop Favorite mis-centering and the mobile header/icon misalignment — the icon cell's `text-center` was accidentally `md:`-scoped only, so mobile's heart icon wasn't centering under the "收藏" header; now unscoped so it centers at every breakpoint; Favorite's width changed from `md:`-scoped to an unconditional 64px so it's fixed on the far right on mobile too, fully independent of Store/Reward Content length; Phase 4E now considered complete; no functional changes
- Homepage UX Polish (Phase 4E, UI refinements) — Desktop table: Store `min-width` reduced 160px→144px (extra space given to Reward Content); all table headers now force `whitespace-nowrap` so short headers like 收藏 never break onto two lines; Used column replaced its text pill with a centered icon only (checked square = used, empty square = unused) in the same neutral palette as the Favorite heart, no green accent; Favorite column given tight symmetric padding so it centers exactly; fixed a mobile regression where hidden utility-column widths (set via inline `style`) were still being reserved by some browsers, pushing Favorite out of its far-right position — widths are now `md:`-scoped so mobile is unaffected; no functional changes
- Homepage UX Polish (Phase 4E, cont'd) — Desktop table: removed Official Link and Expiry Date columns (still reachable via expand panel / Card view / filtering respectively); switched to `table-fixed` with per-column widths sized to real content instead of percentages — Category/Date/Score/Favorite/Used get small fixed widths (no wrap), Store gets a ~160px `min-width` floor so it can flex slightly for longer names while staying much narrower than Reward Content, which is left unconstrained and absorbs the remaining space as the primary flexible column; Store/Category padding tightened so they sit visually closer together; Store/Reward Content left-aligned, Category/Date/Score/Favorite/Used center-aligned (headers match cells); Reward Content single-line truncated and every cell given a consistent minimum height for uniform collapsed-row height; Used status label never wraps, Favorite icon stays centered; table stays stable across common desktop widths; Homepage header Filter→Sort spacing now matches Search→Filter spacing; no functional changes
- Homepage UX Polish (Phase 4E) — Desktop table's expand panel no longer duplicates visible columns, showing only notes/tags/link (the genuinely missing info); collapses to zero height and dims its chevron when a reward has none of those; Mobile's expand panel always shows the full description (kept simple, no JS truncation detection) plus rating/category/expiry alongside notes/tags/link; extracted a shared `RewardExtraInfo` component reused by both Desktop and Mobile; verified via actual rendering with varied mock content that the Card grid's equal-height mechanism already works correctly, no changes needed there; no functional changes
- Homepage UX Refinement (Phase 4D) — mobile wordmark stays on one line at every width (no truncation, no wrap); reward card padding/spacing trimmed to remove empty vertical space (typography unchanged); Desktop Table now expands/collapses inline on row click instead of navigating to the detail page, matching the existing Mobile accordion behavior exactly; expanded row content extended with full description, notes, and tags; extracted a shared `RewardCardBody` component so Card grid and Table accordion reuse identical rendering logic; `/reward/[id]` route kept intact for direct access/SEO, only internal navigation to it removed; no functional changes to search/filter/sort/favorite/used
- Homepage Visual Refinement (Phase 4C v2) — header simplified to English-only wordmark (uppercase, wider tracking); 0.075em letter-spacing applied site-wide via inherited body tracking; reward card breathing room increased (padding, divider spacing, description line-height, notes spacing, bottom spacing); grid gap increased; search bar background/radius now matches the filter bar; badge border/text unified via `badgeBorder`/`badgeText` tokens; all active/selected states (view toggle, filter badge, tag selection, used-filter toggle, sort selection) unified onto one `accentSoft` token; store name typography refined (serif, 20px, light); divider uses dedicated `divider` token; card shadow softened; no new hardcoded colors — everything added to `lib/theme.ts`; no functional changes
- Homepage Visual Refresh (Phase 4C) — light-weight serif "Birthday Rewards" wordmark with generous letter-spacing + small Chinese subtitle in a compact two-line header; larger/rounder search bar with more breathing room; filter toggle and result count merged into one row; view toggle active state switched from dark ink to a soft coffee tint; reward card restructured (softened divider under title, description, optional notes in a lighter tone, badges + rating moved to the bottom row, Link/Favorite grouped as top-right icon buttons with Used kept as a labeled pill); all colors driven by centralized theme tokens; no changes to search/filter/sort logic or toggle behavior
- Homepage UI Refinement (Phase 4B) — removed the modal from Phase 4A entirely (cards are non-interactive again); unified badge row (Category → Validity → Redemption tags) with one shared badge style; reserved one-line notes row for fixed card height; typography hierarchy (16px/semibold store name, 14px description, 12px notes); Lucide `Star`/`Tag`/`Calendar` icons replace remaining emoji; used-status pill kept as-is
- Card Modal (Phase 4A) — reward cards stay a fixed height and open a lightweight modal (full content + tags) instead of linking to the detail page; official-site visit moved to a small link icon beside Favorite; used-toggle/favorite/link-icon keep independent click behavior; detail page kept for direct links/sharing/sitemap
- Dashboard Summary Simplification (Phase 3D) — removed Total Rewards, Average Score, and Highest-rated Store cards; single row of 店家數/收藏/已使用/未使用, category summary unchanged
- Mobile Rewards Table UI (Phase 3C) — single-line row (store + promo preview + favorite), accordion detail, no horizontal scroll

---

## High

- Theme System
- Remove Dark Mode
- localStorage

---

## Medium

- Remove Logo
- Better Tag UX

---

## Future

- AI Import
- OCR
- CSV Import
- PWA
