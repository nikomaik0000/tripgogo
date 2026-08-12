# Changelog

## TRIP GOGO — Transportation Details

Added

- Added multi-entry rental-car and JR/rail details to the existing Outline page, including responsive cards, dialogs, links, notes, and owner/editor CRUD controls.
- Added the isolated `tg_transportations` table with type/integrity constraints, indexes, creator/timestamp triggers, visibility-aware reads, member-only writes, and Trip duplication support.

Changed

- Extended the existing Supabase client/server repository bundle and mapper/type layers to load transportation details alongside flights and hotels.
- Added an Outline quick navigation row for flights, accommodation, transportation, and the existing date-grouped TravelItem summary, with sticky-header-safe smooth scrolling.

## TRAVEL GOGO — Trip Visibility UI

Added

- Added an owner-only public/private Switch to the existing Trip create/edit Dialog without changing its dimensions or surrounding layouts.
- New Trips default to public, while edited Trips display their persisted `is_public` value.

Changed

- Owner visibility changes are saved through the existing owner-only `tg_set_trip_visibility` RPC; editors cannot see or submit this control.

## TRAVEL GOGO — OAuth Redirect Fix

Changed

- Google OAuth now sends an exact origin-relative `/auth/callback` redirect without query parameters, preventing localhost login from falling back to the production Site URL.
- The pre-login path is retained in same-origin sessionStorage and restored only after a successful session instead of being included in Supabase's redirect allowlist URL.

## TRAVEL GOGO — Supabase Phase 3

Added

- Added owner-only editor management inside the existing Trip edit Dialog, including invite, pending status, revoke, and editor removal actions.
- Added a low-key invitation prompt that is completely absent when the signed-in user has no pending invitations.
- Added invitation acceptance through the existing RLS-protected RPC and refreshed Trip permissions immediately after acceptance.

Changed

- Swapped the existing Trip List header controls so Add Trip is left of Login/Logout without changing their styling or dimensions.
- Kept anonymous users, signed-in non-members, and editors away from owner-only Email/member management UI; RLS remains authoritative.

## TRAVEL GOGO — Supabase Phase 2

Added

- Added Google OAuth with cookie-backed Supabase sessions and middleware refresh.
- Added browser/server Supabase clients and public SSR data loading so auth initialization never blocks Trip content.
- Replaced active localStorage CRUD with an RLS-backed Supabase repository while preserving the existing localStorage source for Phase 4 import.
- Added atomic `tg_duplicate_trip` and `tg_reorder_travel_items` repository RPCs.
- Limited existing management controls and drag-and-drop to authenticated Trip owners/editors without changing card layouts, Maps links, or business-hours parsing.

## TRAVEL GOGO — Supabase Phase 1

Added

- Added an isolated `tg_*` Supabase schema for Trips, members, invitations, itinerary items, flights, hotels, profiles, and idempotent localStorage import records.
- Added indexes, integrity constraints, timestamp/ownership triggers, controlled membership/invitation/import RPCs, and database-enforced RLS.
- Public access is read-only for Trip content; only Trip owners/editors can modify content, and only owners can manage invitations or editors.
- Kept `tg_profiles.email`, memberships, invitations, and import records unavailable to anonymous reads.

## v4.0 (In Progress)

### Phase 5A-2 - CSV Export Cleanup

CSV export only (JSON/XLSX export, import, and the export button are unchanged).

Changed

- CSV export now includes only user-facing fields — Store/Category/Content/Date/Score/Official URL/Notes/Tags — dropping `expiry_date`, `is_favorite`, `is_used`, `click_count`, `created_at`, `updated_at`
- CSV headers renamed to Traditional Chinese (店家/類別/優惠內容/日期/分數/官方網址/備註/標籤) in that fixed column order
- CSV output now includes a UTF-8 BOM for reliable Excel compatibility
- `exportRewardsData` (shared by CSV/XLSX/JSON) and the JSON/XLSX export paths are untouched — the field/header mapping is applied only inside the CSV branch of `downloadExport`

### Phase 5A-1 - Admin Table Layout

Desktop only. Mobile is unchanged from Phase 4A.

Changed

- Admin Rewards table column order now matches the frontend table: 店家 / 類別 / 優惠內容 / 日期 / 分數, with Edit and Delete split into their own columns (previously combined into one trailing column)
- Added a Content column (single-line, truncated with ellipsis — never increases row height)
- Column proportions approximate the frontend table: Store ~18%, Category ~10%, Content flexible (largest), Date ~8%, Score ~8%, Edit/Delete fixed width; `sm:table-fixed` + colgroup hold these proportions, same approach as the frontend `RewardTable`
- Mobile: unchanged — Category/Content/Date/Score stay hidden below `sm`; Store and the two action buttons remain visible
- No changes to search, sorting, pagination, selection, bulk delete, backend logic, or database schema

### Phase 4E (mobile-only refinement) - Favorite Column Width

Mobile-only. Desktop is unchanged.

Changed

- Mobile: Favorite column narrowed from 56px to 44px, with the freed width going to Store (the only other unconstrained visible column on mobile) — this shifts the whole Favorite column further toward the right edge without moving the heart icon within its own column; the header and icon remain centered via the same symmetric padding/`text-center` as before, regardless of column width
- Desktop: Favorite stays at the agreed 56px, unaffected — the width is now `44px` on mobile / `md:56px` on desktop instead of a single unconditional value

### Phase 4E (rendering fixes) - Store Truncation & Favorite Spacing

A pass to fix the actual rendering bugs behind two remaining visual concerns, agreed on with a table-layout specification review first (widths unchanged: Store 136 / Category 80 / Content flexible / Date 72 / Rating 72 / Favorite 56 / Used 56). Table layout only — no sorting, filtering, favorites, used-status, data-fetching, expanded-row, Card View, or mobile-behavior changes.

Changed

- Desktop: fixed a real truncation bug in the Store cell — its text wrapper used `md:flex-none`, which disables flex-shrink and silently defeated the `truncate` ellipsis, letting long store names render at their natural width past the fixed 136px column instead of clipping to it. Switched to `flex-1 min-w-0` at every breakpoint, so the rendered width now actually matches the 136px column (this is why Store visually "felt wider" than its nominal width — the column was correctly 136px, the text inside it just wasn't being clipped to fit)
- Mobile: removed a hardcoded `pr-2` on the store content preview line that added a fixed buffer regardless of text length, and gave Favorite its own compact, symmetric padding instead of the shared table-wide default — together these were stacking into what looked like unnecessary empty space between the content and the heart icon
- Favorite's width synced to the agreed 56px (was still 64px in code from an earlier pass); table `min-w` recalculated (690px → 682px) to match

### Phase 4E (mockup alignment) - Column Proportions & Store Width

A pass to match the provided reference mockup's layout/proportions. No functional, sorting, filtering, favorites, used-status, data-fetching, expanded-row, Card View, or mobile-behavior changes — table layout only.

Changed

- Desktop: Store switched from a `min-width` floor to a true fixed `width` (136px, within the mockup's suggested 130–140px), matching the mockup's explicit "fixed smaller width" direction for this column
- Desktop: Category/Date/Rating/Used widths trimmed slightly (84→80px, 80→72px, 80→72px, 64→56px respectively) to give more of the freed width to Reward Content, which was already unconstrained and now becomes even more clearly the dominant column — matching the mockup's ~50%-for-Content proportions
- Favorite kept at 64px (already within the mockup's suggested 56–64px), unconditional across breakpoints as before
- Confirmed alignment (Store/Content left, everything else — especially Favorite/Used — centered with header and content sharing the same center line) and the icon-only Used indicator both already matched the mockup from the prior pass; no further changes needed there
- Table `min-w` recalculated (712px → 690px) to reflect the smaller utility-column footprint

### Phase 4E (final polish) - Store/Content Balance & Favorite Centering

A final testing-driven pass on desktop and mobile, closing out Phase 4E. No functional changes.

Changed

- Desktop: Store's `min-width` reduced from 144px to 136px, giving more of the freed space to Reward Content — the primary information on the site
- Desktop: Favorite's custom padding override removed — it now shares the same default padding as every other unlisted column, so centering comes purely from its fixed width + `text-center`, with no padding-based positioning
- Fixed a real bug behind the desktop Favorite mis-centering *and* the mobile Favorite/header misalignment: the icon cell's `text-center` was accidentally scoped to `md:` only, so on mobile the "收藏" header centered but the heart icon defaulted to the left. It's now unscoped (applies at every breakpoint), so header and icon share the same center line on both mobile and desktop
- Mobile: Favorite's width is now an unconditional (non-breakpoint-scoped) `64px`, applied at every breakpoint rather than only on desktop — so it stays fixed on the far right with a small, constant footprint that Store/Reward Content can never push or affect, independent of either column's length

### Phase 4E (UI refinements) - Table Sizing, Headers & Used Indicator

A follow-up pass on the table work directly above, based on visual testing feedback. No functional changes.

Changed

- Desktop table: Store's `min-width` reduced from 160px to 144px, giving the freed space back to Reward Content
- Desktop table: all headers now force `whitespace-nowrap` (previously only the Used label did), so short headers like "收藏" never break onto two lines
- Desktop table: Used column replaced its "已兌換/未使用" text pill with a centered icon only (`SquareCheck` when used, `Square` when not) — the column header already says 使用, so the label was redundant; colored the same neutral palette as the Favorite heart (muted / accent-coffee) rather than green, so it doesn't read as its own accent
- Desktop table: Favorite column given its own tight, symmetric padding so both its header and icon center exactly, with no leftover asymmetric space
- Fixed a mobile regression: utility-column widths (Category/Date/Score/Favorite/Used) were being set via inline `style` on `<colgroup>`, which isn't responsive — some browsers still reserved that width even though those columns' cells are hidden on mobile, which pushed the Favorite icon out of its expected far-right position. Widths are now `md:`-scoped Tailwind classes instead, so mobile is unaffected and sizes itself purely from its two visible columns (Store, Favorite), matching pre-Phase-4E mobile behavior

### Phase 4E (cont'd) - Table Layout & Header Spacing

A follow-up pass on the same Phase 4E table, on top of the accordion work below. No functional changes.

Changed

- Desktop table: removed the "官網連結" (Official Link) and "截止日期" (Expiry Date) columns entirely — the official link is still reachable from the row's expand panel (`RewardExtraInfo`); expiry date still drives filtering/sorting and still appears on the Card view, it's just no longer a dedicated table column
- Desktop table: switched to `table-fixed` with per-column widths sized to actual content instead of percentages — Category, Date, Score, Favorite, and Used each get a small fixed width (no wrap); Store gets a `min-width` floor (~160px) so it can flex slightly for longer names while staying much narrower than Reward Content; Reward Content itself is left unconstrained so it absorbs the remaining space as the primary flexible column, matching real data (store names are usually short, reward descriptions are usually the longest text in the table)
- Desktop table: Store and Category sit visually closer together via tightened inner padding between them; all other column spacing is unchanged
- Desktop table: Store and Reward Content are left-aligned; Category, Date, Score, Favorite, and Used are center-aligned — applied identically to headers and cells
- Desktop table: Reward Content is single-line truncated at every breakpoint (previously 2-line clamp on desktop), and every cell has a consistent minimum row height, so collapsed rows are uniformly sized regardless of content length or icons
- Desktop table: the "已兌換/未使用" status label never wraps onto two lines, and the Favorite heart icon stays centered in its column
- Desktop table: `table-fixed` + explicit widths keep columns aligned and stable across common desktop widths instead of reflowing
- Homepage header: Filter → Sort row spacing increased to match Search Bar → Filter spacing, so both gaps are visually consistent

### Phase 4E - Homepage UX Polish

A refinement pass on top of Phase 4D. Reuses existing components; no functional changes.

Changed

- Desktop table's expanded row no longer repeats what's already visible in the row itself (category/description/date/score/expiry/used/link) — it now shows only notes, tags, and the official link, i.e. the information that's genuinely missing from the table
- When a reward has none of those three things, the desktop expand panel now collapses to true zero height instead of revealing an empty padded box, and its chevron dims to not promise content that isn't there (mobile is unaffected — it always has something to show, since its columns are hidden)
- Mobile's expanded row now always shows the full description (kept intentionally simple — no JS-based truncation detection) alongside rating/category/expiry (the only place those are visible on mobile), plus notes/tags/link
- Tightened spacing throughout the expand panel so it's only as tall as its content requires

Added

- `components/reward-extra-info.tsx`: the notes/tags/official-link block, shared identically between the Desktop and Mobile expand panels

Verified (not assumed) that the Card grid's equal-height mechanism (`min-h-card` + `flex flex-col` + `mt-auto`-pinned badge row, combined with CSS Grid's default row-stretch) already produces consistent card heights regardless of notes/description length — confirmed by rendering the actual components with varied mock content and pixel-measuring the output; no changes were needed there.

### Phase 4D - Homepage UX Refinement

UX/behavior refinement on top of Phase 4C. Reuses existing components; no new visual design outside what's described below.

Changed

- Mobile header: the "BIRTHDAY REWARDS" wordmark now stays on one line at every screen size — smaller size + tighter tracking below `sm`, `whitespace-nowrap` instead of `truncate` (no ellipsis, no wrap)
- Reward card: padding and internal spacing trimmed to remove empty vertical space on shorter cards (typography unchanged); `cardMinHeight` reduced accordingly
- Desktop table: clicking a row now expands/collapses inline (same accordion + animation the mobile table already used) instead of navigating to `/reward/[id]` — behavior is now identical across all screen sizes
- Table's expanded row now shows the full description, notes (previously missing entirely), and tag badges, alongside the rating and official-site link that were already there

Added

- `components/reward-card-body.tsx`: extracted the description/notes/badges/rating block shared by `RewardCard` and `RewardTable`'s expanded row, so the Card grid and Table accordion can never visually drift apart — single source of truth instead of duplicated markup
- `lib/theme.ts`: `typography.letterSpacing.wordmarkCompact`, used only below the `sm` breakpoint

No changes to search/filter/sort/favorite/used logic, data fetching, or the `/reward/[id]` route itself — it's kept fully intact for direct URL access and `sitemap.ts`; only the one internal link to it (from the table's store cell) was removed.

### Phase 4B - Homepage UI Refinement

Changed

- Removed the Phase 4A modal entirely — reward cards are plain, non-interactive containers again; clicking a card does nothing (no dialog, no navigation to `/reward/[id]`)
- Consolidated badges into a single row directly under the store name, in a fixed order: Category → Validity Period (`ExpiryBadge`) → Redemption Method(s) (tags) — previously tags rendered in a separate row below the description
- All badges (`CategoryBadge`, `TagBadge`, `ExpiryBadge`) now share one unified visual style (background, text color, border, shadow, radius, padding, font size) instead of per-category/per-tag/per-expiry-state colors; the shared style lives in one place (`BADGE_CLASSES` in `lib/constants.ts`)
- Added a permanently-reserved one-line notes row below the description: `› {note}` (truncated to one line) when `reward.notes` is set, or a non-breaking space placeholder when it's empty — so every card is exactly the same height whether or not it has a note
- Typography hierarchy: store name is now 16px/semibold (was unstyled/medium); description stays 14px/regular; the new notes line is 12px, light gray, regular weight
- `StarRating` now renders a small (14px) Lucide `Star` outline icon (no fill, matching the outline style of Heart/Link) instead of the ⭐ emoji, still showing `★ 4/5`-style output; the same swap was applied to the score-filter checkboxes in `FilterPanel` for consistency
- The `›` note prefix renders at reduced opacity (`text-muted/50`) so it reads as a subtle cue rather than competing with the note text itself
- Fine-tuned vertical rhythm: slightly tighter spacing between the badge row and the description, slightly more spacing between the description and the notes line
- Replaced the 🏷 / 📅 emoji in the mobile table accordion (`RewardTable`) with Lucide `Tag` / `Calendar` icons, since that view is part of the same homepage
- The used-status pill ("已兌換" / "未使用") is unchanged — it remains a bordered pill with its text label, intentionally distinct from the icon-only Heart/Link controls since it's a status indicator, not an action button
- The `/reward/[id]` detail page is unchanged; search, filters, sorting, favorites, used-status, and the admin dashboard are all unaffected

### Phase 4A - Card Modal (Replaces Detail Page Navigation)

Changed

- Reward cards (grid view) no longer link to the `/reward/[id]` detail page on click; the entire card now opens a lightweight modal instead
- Cards keep a fixed height at all times — the 3-line content clamp is never removed, so the grid layout stays clean and consistent on both desktop and mobile
- Removed the chevron indicator — the whole card is already the click target, so a separate arrow was redundant
- Store name is now plain text instead of a hyperlink; the top-right link icon is the single, unambiguous way to visit the official site (avoids two navigation targets pointing at the same URL)
- The modal (built on the existing `Dialog`/`DialogContent` components already used elsewhere in the app) shows the reward's full, untruncated content plus its category/expiry badges and tags; it is reserved for additional information going forward (e.g. notes) and is intentionally lightweight — no navigation, no notes/history/admin editing
- A small link icon now sits beside the favorite icon in the top-right corner of the card; clicking it opens the official website directly in a new tab (only shown when the reward has an `official_url`)
- Favorite button, used-toggle button, the store-name official-site link, and the top-right link icon all stop event propagation so they keep their own click behavior and never open the modal
- The `/reward/[id]` detail page is unchanged and still reachable directly (deep links, sharing, sitemap); it's just no longer linked from the card grid
- No changes to search, filters, sorting, favorites, used-status, or admin functionality

### Phase 3D - Dashboard Summary Simplification

Removed

- Total Rewards, Average Score, and Highest-rated Store cards from the dashboard summary

Changed

- Dashboard summary now shows a single row of four cards: 店家數, 收藏, 已使用, 未使用
- Result counter simplified from "共 N 筆優惠" to "N 筆"
- Removed the "各類別數量" title above the category summary row; increased its vertical padding and switched its background to 90% opacity (`bg-surface/90`, no border) so it reads as a lighter section beneath the summary cards rather than another card

### Phase 3C - Mobile Rewards Table UI

Changed

- Rewards table on mobile now shows a single-line row: ▼ chevron + Store Name (fixed width, truncated) + one-line Promotion Content preview (fills remaining space, truncates with ellipsis) + Favorite icon (far right)
- Category, Date, Rating, Expiry, Used, and Website Link columns are hidden on mobile (`hidden md:table-cell`) and moved into an expandable accordion panel
- Removed the mobile `min-w-[880px]` constraint that forced horizontal scrolling; the minimum width now only applies at `md` and above
- Tapping a row on mobile expands an inline accordion panel below it showing the star rating, category, offer date, full offer content, and a full-width "前往官網" button — no modal or separate page
- Added a chevron indicator (mobile only) on the store cell that rotates 90° when a row is expanded
- Added a lightweight ~200ms expand/collapse transition to the accordion panel (CSS grid-rows, no animation library)
- Favorite button now stops event propagation so tapping it does not also expand/collapse the row
- Row click handler only toggles the accordion on mobile widths (`< md`); desktop clicks no longer trigger unnecessary state updates
- Simplified the expanded accordion: removed the duplicated full promotion content (already visible as the collapsed row's preview); rating, category, and date are now shown in a single horizontal row (⭐ Rating · 🏷 Category · 📅 Date) with the "前往官網" button below
- Store name width increased to 116px (from an earlier 92px pass) so medium-length names have more room before truncating
- Favorite icon gets a touch of extra left spacing on mobile (`pl-6` vs the default `pl-4`) so the row doesn't feel cramped; desktop padding is unchanged
- Desktop layout, columns, and behavior are completely unchanged

### Phase 3B - Admin Mobile Table Optimization

Changed

- Admin table on mobile now hides the Category, Rating, and Date columns, showing only Checkbox, Store, Edit, and Delete
- Reduced the table's mobile minimum width so it fits typical phone screens without unnecessary horizontal scrolling
- Desktop layout, all columns, and table behavior remain unchanged (columns reappear at the `sm` breakpoint and above)

Fixed

- Removed the remaining mobile `min-w-[420px]` constraint that was still forcing horizontal scrolling on narrow phone screens; desktop keeps its `sm:min-w-[760px]` minimum width
- Reduced horizontal cell padding on mobile for the Checkbox, Store, and Action columns; desktop padding is unchanged via `sm:px-4`
- Slightly narrowed the Action column on mobile to reclaim additional space; desktop width is unchanged via `sm:w-20`

### Phase 3A - Rating Display Cleanup

Changed

- Replaced read-only star icon ratings with compact text format (⭐ X/5) across reward cards, tables, admin table, reward detail page, dashboard stats, and the score filter
- Admin interactive rating selector (star click input) unchanged

### Phase 2B - Admin UX

Added

-

Changed

-

Removed

-

---

## v3.4

### Phase 4C v2 - Visual Refinement Pass

A refinement pass on top of Phase 4C, per direct design feedback. UI/markup and theme tokens only — no functional changes.

Changed

- Header: Chinese subtitle removed — the English "BIRTHDAY REWARDS" wordmark is now the only header title (uppercase, serif, larger, wider tracking), for a calmer single-element header
- Global typography: `letter-spacing: 0.075em` now applies to all normal interface text site-wide (store names, descriptions, notes, search/filter/sort UI, buttons, badges) via a `tracking-body` utility on `<body>`, so it's inherited everywhere instead of set per-component; the header wordmark keeps its own wider `tracking-wordmark` value
- Reward card: more internal breathing room — larger padding, more space around the divider, description now explicitly 14px/1.5 line-height, notes pushed further below the description (visibly more than one line-height) and rendered in a lighter tone, more space before the badge/rating row; card `min-height` increased to fit the extra spacing
- Grid: increased gap between cards (also increases row gap, since CSS grid `gap` applies to both axes)
- Search bar: placeholder text removed (icon-only), border radius now matches the filter bar exactly, background uses the new `searchBackground` token — search bar and filter bar now read as the same design component
- Badges: `BADGE_CLASSES` border/text now reference the centralized `badgeBorder` / `badgeText` tokens instead of one-off hex values, so every badge (category, expiry, tag) stays perfectly consistent
- Unified all "active/selected" UI accents (view toggle, filter's active-count badge, selected tag chip ring, used-status filter toggle, selected sort option) onto one neutral `accentSoft` token, replacing the previously mixed dark-ink and coffee-tinted active states
- Store name: serif, 20px, light weight, 1.3 line-height (via the `storeName` token)
- Card divider now uses the dedicated `divider` token (same value as the badge border) instead of the general-purpose border color
- Card shadow softened slightly for a cleaner look

Added

- `lib/theme.ts`: `colors.accentSoft`, `colors.badgeBorder`, `colors.badgeText`, `colors.divider`, `colors.searchBackground`; `typography.letterSpacing.body`; `typography.fontSize.storeName` — all wired into `tailwind.config.ts` and referenced by class name in components, no hardcoded hex added anywhere

### Phase 4C - Homepage Visual Refresh

Changed

- Header: compact two-line brand lockup — serif "Birthday Rewards" wordmark (light weight, generous letter-spacing) as the primary title, with a small muted "生日優惠整理" subtitle underneath
- Search bar: taller, more rounded, more padding, softer border for a cleaner look
- Filter bar: result count now shares the same bordered row as the "篩選" toggle instead of a separate line
- Sort menu / view toggle: view toggle's active state now uses a soft coffee tint instead of dark ink; spacing tidied
- Reward card: larger store name, thin divider under the title (softened border token), description directly below, notes shown only when present in a lighter tone than the description (no more reserved blank line), badge row + rating moved together to the bottom, Link/Favorite grouped as icon buttons with Used kept as a labeled pill (clearer at a glance) in the top-right corner

Added

- `lib/theme.ts`: additive `typography.fontFamily.serif` token (web-safe serif stack, not a Google Fonts import) for the header wordmark only; `typography.letterSpacing.wordmark` and `layout.cardMinHeight` tokens, wired into `tailwind.config.ts`, replacing what would otherwise have been arbitrary one-off values (`tracking-[0.12em]`, `min-h-[248px]`)

No changes to search/filter/sort logic, data fetching, or favorite/used toggle behavior — this phase is UI/markup only.

---

## v3.2

### Phase 2A - UI Cleanup

Removed

- Dark mode
- Store logo
- Click count
- Report feature
- Top clicked dashboard card

Changed

- Simplified sorting
- Cleaner reward detail page
- Cleaner admin table

---

## v3.1

### Phase 1

Added

- Local favorites
- Local used status

Removed

- Dark theme
# TRAVEL GOGO

## 2026-08-07

### Changed

- Renamed the user-facing brand from TRAVEL GOGO to TRIP GOGO across the Header, metadata, Open Graph, and PWA manifest without changing internal identifiers or deployment URLs.
- Moved inner-page create actions into Daily, Place, Food, Flight, and Hotel content areas, and unified every shared Dialog on the centered `+ more` viewport animation.
- Refined the Place/Food control bar with a search-first desktop row and a separated mobile sort/icon-action row, using an icon-only muted CirclePlus.
- Restored the inner-page Header create action as a fixed left slot beside Auth, removed content-level Daily/Place/Food create controls, and unified Flight/Hotel create icons with the homepage CirclePlus style.
- Unified every create entry on one outline-only muted CirclePlus component, matched Header Auth/create hit areas, and restored icon-only date-specific Daily creation.
- Hid the redundant date selector only when creating a TravelItem from a specific Daily date, while preserving selectable dates for generic creation and every edit flow.
- Replaced the blue-gray global focus outline with a subtle inset accentSoft keyboard focus treatment and added an overflow-safe Daily date quick-navigation row with sticky-header-aware smooth scrolling.
- Added independently stored, multi-entry Flight and HotelStay records to Outline with create, edit, delete, chronological sorting, optional links/Maps, and responsive cards.
- Added measured note truncation with an unobtrusive Ellipsis action and read-only full-note Dialog on place and food cards.
- Replaced the truncated-note action with a low-key `+ more` label and corrected the full-note Dialog animation so its positioning transform remains centered from the first frame.
- Added the same measured `+ more` full-note action to truncated notes in desktop Daily cards without changing their fixed height or drag behavior.
- Limited mobile Daily-card notes to two lines and reused the measured `+ more` full-note Dialog behavior from place and food cards.
- Restored Google Maps links on place and food card names while retaining the existing Navigation footer action.
- Restored fixed food/place circle backgrounds in production CSS and restored Google Maps links on Daily item names.
- Guarded Daily drag sensors from every nested link, button, input, textarea, and select interaction.
- Rebuilt Daily cards from the supplied desktop/mobile references, including fixed desktop proportions, compact type marks, and responsive content order.
- Replaced Daily arrow controls with persisted same-day drag-and-drop; touch dragging requires a 350ms long press and cancels on normal scroll movement.
- Replaced extra-link ExternalLink glyphs with Link2 for a clearer visual distinction from edit actions.
- Added two optional URL-only extra links to travel items and rendered them as accessible ExternalLink actions in the card footer.
- Let desktop notes use two lines beside business hours or four lines when the Info Area contains notes alone; mobile notes remain unclamped.
- Consolidated desktop card business hours and notes into one compact fixed Info Area without placeholder rows.
- Finalized the homepage hierarchy with a lighter wordmark, editorial section heading, and date-first trip notebook cards with fixed action footers.
- Fixed place and food cards to a shared 300px desktop height with reserved business-hours and two-line note regions; mobile cards remain content-sized.
- Rebuilt place and food card vertical rhythm around one 24px section token with single-owner spacing between adjacent regions.
- Replaced the card note icon with a muted single-color ✦ and shared one spacing class across both pre-divider gaps.
- Added a low-saturation line-art Luggage favicon while keeping PlaneTakeoff in the site header.
- Reordered place and food card details into a stable location/category/date row, business-hours section, and icon-aligned notes row.
- Added MessageSquareMore to non-empty card notes and tightened footer SVG sizing while preserving touch targets.
- Refined the place and food card footer into a fixed-height, divided action area with consistent icon spacing.
- Stabilized place and food card layouts with two-line name clamping and bottom-aligned icon actions.
- Moved Google Maps, edit, and delete actions into a consistent card footer without changing their behavior.
- Added optional free-text business hours to places and food without changing the v1 storage keys.
- Added a lightweight local-time status parser for simple hours, 24-hour businesses, and overnight ranges.
- Added subtle business-hour details to item cards while keeping Outline unchanged.
- Added a Lucide PlaneTakeoff icon beside the TRAVEL GOGO wordmark.
- Replaced native browser deletion prompts with the shared site Dialog styling.
- Versioned localStorage keys and completed Supabase-ready ownership and timestamp fields.
- Increased mobile icon-button hit areas while preserving desktop density and icon size.
- Scoped category suggestions by item type while keeping area suggestions shared.
- Replaced the Birthday Rewards product flow with a focused trip notebook.
- Added trip creation, editing, duplication, and deletion backed by centralized localStorage access.
- Added Daily, Places, Food, and Outline views derived from one TravelItem collection.
- Added trip-range date choices, free-input suggestions, stable sorting, same-day ordering, and optional Google Maps links.
- Removed rewards, ratings, favorites, statistics, import/export, and administration features.
- Kept the existing design tokens, cards, dialogs, buttons, inputs, responsive breakpoints, and interaction styles.

---
