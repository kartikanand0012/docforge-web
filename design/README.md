# Handoff: DocForge web app

## Overview

DocForge reads invoices, purchase orders and certificates of analysis (CoAs) for Indian pharma distributors and manufacturers. It extracts their values, checks them, matches each invoice to its order, and sends anything doubtful to a person, who corrects the record and signs it with a PIN. People can also search the documents and ask questions about them; every answer quotes the page it came from.

This bundle covers the whole web frontend: sign-in, review queue, document view (page viewer with boxes, values, corrections, order match, certificates, timeline, audit trail, Ask, signing), documents list, upload, search, chat, knowledge bases, evals and cost, and the admin pages (unanswered questions, AI agents, audit log, webhooks). The backend is finished. Every screen sits on existing endpoints, and no new backend work is needed.

**Target stack:** Next.js 16 (App Router) and React 19, inside the existing `web/` app. Keep the existing same-origin proxy: the browser calls `/api/v1/...`, the route handler adds `Authorization: Bearer` from the HttpOnly `df_session` cookie, and the browser never sees a token. See `reference/frontend-handover.md` section 2.

## About the design files

`prototype/DocForge App.dc.html` is a **design reference built in HTML**. It is an interactive prototype showing the intended look and behaviour, not production code to copy. Recreate it in the `web/` codebase using its existing patterns (`web/src/lib/api.ts`, `web/src/lib/chat.ts`, `web/src/lib/geometry.ts`, current pages under `web/src/app`). The prototype uses inline styles and canned data, and it draws the invoice page as HTML. In the real app the page is the PNG from `GET /v1/documents/{id}/pages/{n}`, and every value comes from the API.

To open the prototype, serve the `prototype/` folder over HTTP (for example `npx serve prototype`) and open `DocForge App.dc.html`. It has a Tweaks panel with these switches:

- `theme`: light or dark.
- `role`: reviewer or admin. Admin shows the admin navigation.
- `queueState`: normal, loading, empty, error, rateLimited or offline.
- `signOutcome`: success, wrongPin or stale.
- `degraded`: shows the "only exact words matched" search notice.
- `showEndpoints`: labels each region with the endpoint that feeds it.

Turn on `showEndpoints` while reading the screens below.

## Fidelity

**High fidelity.** Colours, type, spacing, radii, copy, states and interactions are final. Recreate them as closely as you can with the codebase's own component approach (CSS Modules or Tailwind with these tokens; either is fine). The prototype's only deliberate placeholders are the drawn invoice page and the sample data.

---

## Design tokens

All tokens are in **`tokens.css`**, ready to drop into `globals.css`. Summary:

**Type.** IBM Plex Sans for everything (headings 600, body 400, emphasis 500). IBM Plex Mono for hashes, key prefixes, URLs, event names, tool names and `kbd`. Numbers always use `font-variant-numeric: tabular-nums`.

| Role | Size / weight / line-height |
| --- | --- |
| Page title (h1) | 30–32px / 600 / 1.12, letter-spacing -0.01em |
| Document title (h1, document view) | 24px / 600 |
| Section (h2) | 18–22px / 600 |
| Group label | 13px / 500, uppercase, letter-spacing 0.08em, neutral-700 |
| Body | 14px / 400 / 1.55 |
| Extracted value | 16px / 500, tabular |
| Chat question | 21px / 600 / 1.25 |
| Chat answer | 16px / 400 / 1.55, `text-wrap: pretty` |
| Secondary / meta | 12–13px, neutral-700 |
| Table header | 11px uppercase, letter-spacing 0.08em, 60% ink |
| Badge | 11.5–12px / 400 |
| Metric figure (evals) | 36px / 600 / 1.1, tabular |

**Colour.** There is one accent, `#5980a6` (dark theme `#7ea2c6`), used only for action, selection and focus. Paragraph-size text in the accent uses `--color-accent-700`. The ground is `#f2f2f3` (dark `#141719`), the surface `#e9e9ea` (dark `#1c2023`) and the ink `#1d1f20` (dark `#e3e5e7`). Status colours (ok, warn, fail, info, neutral) each have `fg`, `bg` and `line` values for both themes. **A status colour never appears without a word.**

**Spacing.** `3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2px`. Page padding is 28px on the sides with 22px headers. Rows are 10–14px vertical by 16–28px horizontal.

**Radius.**

- 4px: `kbd` and citation markers.
- 5px: tags and badges.
- 6px: alerts, inline boxes and code chips.
- **8px: buttons, inputs, segmented controls, cards and result rows.**
- 10px: list cards, inline forms and webhook cards.
- 12px: dialogs and the drop zone.
- 999px: filter chips.

**Elevation.** `--shadow-md` for the page image and the sign-in card, `--shadow-lg` for dialogs and toasts.

**Signature details (keep these):**

- **Registration marks:** 11px "+" crosshairs, centred 6px outside each corner, at 55% ink. They appear on primary buttons, metric cards, quote cards, empty and denied panels, the sign-in card and the page frame. The CSS is in `tokens.css` (`.marked`).
- **Blueprint grid:** the page viewer and sign-in backgrounds have a 24px (sign-in 28px) grid of 5%-ink lines over the surface colour.

**Focus.** `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }` everywhere. Never use the browser default.

**Icons.** Lucide at stroke-width 1.5, at 14–16px inline and 28px in empty states. The icons used, with Lucide names:

- inbox, file-text, upload, search, message-square, book, help-circle and bar-chart.
- bot, shield-check, webhook, check, x, alert-triangle and git-compare.
- pencil, lock, log-out, moon, wifi-off, clock, alert-circle and refresh-cw.

---

## Components

Build these once and reuse them.

1. **Button.** Primary: accent fill, bg-coloured text, 8px radius, registration marks; hover accent-600, pressed accent-700. Secondary: transparent with a divider border; hover 7% ink, pressed 14% ink. Ghost: accent-700 text, no border; hover 10% accent tint. Destructive: ghost with `--st-fail-fg` text, or primary filled with `--st-fail-fg` inside confirm dialogs. Padding is 7×12px (primary 8×16px), text 13.5px / 500. Disabled is 45% opacity.
2. **Input, select, textarea.** Minimum height 36px, padding 6×10px, surface fill, divider border, 8px radius. Hover border is 45% ink; focus border is the accent. The label sits above at 12px, 70% ink.
3. **PIN entry.** Six 42×48px cells with an 8px radius on the surface fill; each filled cell shows "•". One real `<input type="password" inputMode="numeric" maxLength=6 autocomplete="off">` lies transparent over the cells, labelled "Signing as {name} ({email}). Enter your 6-digit PIN." The current cell gets an accent border and a 1px accent ring while focused. Strip non-digits as the user types.
4. **Segmented control.** Native radios in `.seg`. The checked option has an accent fill and bg-coloured text. The outer radius is 8px, with 7px on the first and last options.
5. **Tag.** 11px, 3×10px padding, 5px radius. `tag-accent` (accent-100 / accent-800) is used for document type; `tag-neutral` for scope and event names.
6. **Status badge.** An inline-flex pill: 2×8px padding, 5px radius, 1px `--st-{kind}-line` border, `--st-{kind}-bg` fill, `--st-{kind}-fg` text, an optional 12px icon and **always a word**. Words used: Ready, Queued, Converting, Reading, Extracting, Checking, Indexing, Done, Retrying, Failed, Approved, Rejected, Delivered, Uploading, Refused, Already here, Not sent, Met, Not met, Within budget.
7. **Stage progress.** Six 14–18×4px bars with a 2px radius and 3px gap; done and current bars are accent, the rest neutral-300. Always put text beside it ("Extracting · step 3 of 6"). Stage words come from handover section 6.
8. **Reason line.** A 14px icon in `--st-{kind}-fg`, then a bold label in the same colour, a colon and plain text. Example: "**Check failed:** Total is ₹180.00 more than the lines plus IGST". Labels: *Check failed* (icon x), *Uncertain value* (help-circle), *Does not match its order* (git-compare), *Not linked yet* (help-circle). In the queue preview pane it becomes a box with a tinted background and border.
9. **Field row** (document view). See the screen spec below.
10. **Confidence meter.** A 34×4px track (divider colour) with an fg-coloured fill at the percentage, then the text "61%". The colour is ok at 80% or more, warn below 80%, and info showing "Corrected" after a correction.
11. **Page viewer with boxes.** See the screen spec below.
12. **Quote card.** A button with 1px divider border, 8px radius, registration marks and 11×13px padding. It holds a kicker ("1 · MS-INV-04417.pdf · page 1", 11px uppercase, accent-700), the quote in curly quotes (13.5px, tabular) and "Show on page →" (12px accent-700). Hover adds a 7% accent tint. Cards sit in a `repeat(auto-fill, minmax(260px, 1fr))` grid with a 14px gap.
13. **Citation marker.** An inline button `[n]` with 0×5px padding, 1px accent border, 4px radius, 11px / 600 accent-700 text and `vertical-align: 2px`. Its aria-label is "Quote n, show on page".
14. **Table.** `.table` with 11px uppercase headers, a 1px divider under the header and 8%-ink row rules; row hover is 4% ink. Every header has `th scope="col"`. Wide tables scroll inside an `overflow-x:auto` wrapper and have a `min-width`.
15. **Toast.** Fixed at bottom-centre, 24px from the edge. Accent-900 fill, bg-coloured text, 11×16px padding, `--shadow-lg`, maximum width 620px, `role="status" aria-live="polite"`. It may carry one outlined action button and auto-hides after 6 seconds.
16. **Dialog.** A backdrop of 50% neutral-900, the panel `min(440–520px, 100%)` wide with a 12px radius, `--shadow-lg` and bg-coloured fill. Use `role="dialog"` (confirmations `role="alertdialog"`) with `aria-modal`, trap focus, close on Escape and return focus to the opener.
17. **One-time secret dialog.** The title, a body ("This is the only time the key is shown…"), then the secret in mono on the surface fill with an 8px radius and `user-select: all`. Beside it a **Copy** button that changes to "Copied". Under it, a warn line: "It is not stored in DocForge in readable form and cannot be shown again." The primary button is **"Done, I have copied it"**. Never store the secret, and focus the Copy button on open.
18. **Empty / error / denied panel.** A centred panel with registration marks, maximum width 420–440px, 28px padding, a 28px icon, a 22px heading, a muted sentence and one secondary action.
19. **Alert banner.** 16–18px padding, 6–8px radius, tinted status background and border, an icon and a bold first sentence followed by plain text. Use `role="alert"` for errors and `role="status"` for information.
20. **Endpoint chip.** Prototype only (the `showEndpoints` tweak). Do not ship it.

---

## App shell

- **Grid:** `232px | minmax(0,1fr)`, full viewport height, `overflow:hidden`. Each screen scrolls inside itself.
- **Sidebar** (16px vertical by 12px horizontal padding, 1px divider on the right), from top to bottom:
  - The brand: a 26px square with accent border and marks showing "D", then "DocForge" (19px / 600) and the organisation name (11.5px).
  - The main navigation: Review queue (with the count), Documents, Upload, Search, Chat, Knowledge bases, Evals and cost.
  - Administration, shown **only when role = admin**: Unanswered questions, AI agents, Audit log, Webhooks.
  - At the bottom: the user's name, "Reviewer · email" and two secondary buttons, "Dark theme"/"Light theme" and "Sign out".
- **Nav item:** 7×10px padding, 14px text, a 16px icon and an 8px radius. The current item has `aria-current="page"` and an accent-100 fill with accent-800 text; hover is 7% ink.
- **Below 1100px:** the sidebar becomes a 60px icon rail. Each icon button keeps `aria-label` and `title`. The bottom shows a 32px initials circle ("PN", accent-100 fill) and icon buttons for theme (moon) and sign out (log-out).
- **Theme:** follow `prefers-color-scheme` by default. The sidebar toggle overrides it; persist the choice in localStorage.
- **Admin pages for non-admins:** if someone reaches one (for example by URL), or the API answers 403, show the denied panel: "Only administrators can see this page." / "Ask an administrator in your organisation if you need it." / [Back to the review queue].

---

## Screens

Every screen header: 22px top and 16px bottom padding, 28px sides, a 1px divider below, the h1 with a one-line muted description under it, and actions on the right.

### 1. Sign in (`/login`)
- **Layout:** the full viewport with the 28px blueprint grid. A centred card, `min(400px,100%)` wide, 28px padding, marks and `--shadow-md`.
- **Content:** "DocForge" (15px / 600 accent-700), h1 "Sign in" (26px), then the fields Organisation, Email and PIN (`type=password`, numeric, `maxLength=6`, letter-spacing 0.4em, 18px). Then a primary **Sign in** button across the full width, and "You stay signed in for 8 hours."
- **API:** `POST /api/session` (web app) calls `POST /v1/sessions` `{tenant, email, pin}`. On success, go to `next` or `/`.
- **Errors (`role="alert"`, tinted box):**
  - Empty fields: "Enter your organisation and email."
  - Short PIN: "Enter your 6-digit PIN."
  - 401: "Those sign-in details are not right. Check the organisation, email and PIN." (one message, whatever was wrong).
  - 429 or lock: warn style, "Too many wrong PINs. Signing in is locked for 15 minutes; try again at {time from Retry-After}."

### 2. Review queue (home, `/`)
- **API:** `GET /v1/review/queue` returns `[{document_id, doc_type, filename, version_no, created_at, reasons, match_status}]`, oldest first.
- **Header:** h1 "Review queue". The subline gives the count and a breakdown, for example "9 documents need a person, oldest first · 4 failed checks, 4 uncertain values, 3 order mismatches". On the right, keyboard hints: `J` `K` move · `Enter` open.
- **Body grid:** `minmax(0,1fr) | minmax(300px,380px)`. Below 1280px the preview pane hides and the list takes the full width.
- **List:** `role="listbox"` with `aria-activedescendant`. Each row is a `role="option"` with `aria-selected`:
  - Row grid: `96px | 1fr | 116px`, gap 16px, padding 14×28px, 1px divider below. Below 760px it is one column.
  - Column 1: the type tag, and "Version n" when n > 1.
  - Column 2: the filename (15px / 500) and party plus amount (13px muted, tabular, e.g. "Medisynth Pharma · ₹4,12,877.60"), then **every reason as a reason line** (component 8).
  - Column 3, right-aligned: "Waiting 2 days", then the local time in `<time dateTime=UTC>`.
  - The selected row has a 9% accent tint and an inset 1px accent-400 ring; hover is 4% ink.
- **Preview pane** (22×24px padding):
  - A kicker with the type and position ("Invoice · 1 of 9"), the filename as h2 (24px) and the party line.
  - "Why a person is needed", with the reasons as tinted boxes.
  - Received and version details in a `dl`.
  - A primary **Open document** button with an `Enter` kbd hint.
- **Keyboard:** `J`/`↓` next, `K`/`↑` previous, `Enter`/`O` open. Ignore keys while focus is in an input. Clicking a row selects it; double-click opens it.
- **States:**
  - **Loading:** six skeleton rows (neutral-200 blocks), `aria-busy`.
  - **Empty:** a panel with a check icon: "Nothing waits for a person" / "Every document read so far passed its checks or has been signed. New documents that need a person appear here as soon as they are checked." / [Upload documents].
  - **Error (503):** fail banner: "The review queue could not be loaded." / "The database is unavailable at the moment (503). Nothing was lost; try again shortly." / [Try again].
  - **429:** warn banner: "Too many requests in the last minute." / "Try again in {N} seconds. The queue reloads by itself then." Count down from `Retry-After`, then reload.
  - **Offline:** a warn strip under the header (wifi-off icon): "**You are offline.** This is the queue as of 11:40. It refreshes when you reconnect; signing waits until then." The list stays visible.

### 3. Document view (`/documents/{id}`), the heart of the product
**APIs:**
- `GET /v1/documents/{id}`
- `GET …/review` (ReviewOut)
- `GET …/pages/{n}` (PNG)
- `GET …/timeline` and live `GET …/events` (SSE)
- `GET …/audit`
- `POST …/corrections`, `POST …/review`, `POST …/reprocess`
- Chat with `document_id`

**Header** (12×20px padding):
- A ghost "‹ Queue" button.
- A meta line: the type tag, a stage badge (Ready) and "Version 1 · 1 page · from ERP integration · {time}".
- h1: the filename (24px) followed, in body font 14px muted, by "{party} · {invoice no}".
- On the right: "1 of 9 in queue" and a secondary **Read again** (reprocess). Its toast: "Reading again. Version 2 appears here when it is ready; you can keep working on version 1." On 409: "A reading is already under way."

**Body grid:** `minmax(0,1fr) | minmax(400px,480px)`. Below 1000px it stacks into rows, `68vh` for the viewer and `auto` for the panel, with the page scrolling.

**Left: page viewer**
- **Toolbar** (8×16px padding, no wrapping, scrolls sideways): "Page 1 of 1", zoom − / {n}% / + (50–200% in steps of 25; 100% means fit to width), a checkbox "Show every box" (default on), and a legend: solid 1.5px box "Read", dashed amber box "Needs a person".
- **Quote banner** (when opened from chat, search or Ask): an accent-100 strip: "Showing {quote 1 from chat | search result}: “{quote}”" with [Clear].
- **Canvas:** 28px padding over the blueprint grid. The page image sits centred in a frame with registration marks, its width set by zoom, `aspect-ratio` from the PNG and `--shadow-md`.
- **Boxes:** absolutely positioned over the image. Coordinates come from the review `assessment` and `record` geometry, converted by `web/src/lib/geometry.ts` and expressed as percentages so they scale with zoom.
  - **Read value:** 1.5px solid `--box-read` border, transparent fill.
  - **Flagged value** (has a failed or uncertain check): 1.5px **dashed** `--box-flag` border.
  - **Hover:** 2px border with the hover fill. **Active:** 2px solid border with the active fill.
  - On hover or active, a label above the box (top − 22px): the field name in 11px / 500 white on `--box-read` or `--box-flag-label`.
  - **Citation or search box:** 2px solid `--box-read`, a 16% accent fill and a label "Quote n" or "Match".
  - Boxes are `<button tabindex=-1 aria-label="Value read here: {field}">`; keyboard users reach values through the field list.
  - With "Show every box" off, only flagged, hovered and active boxes are drawn.

**Right: panel**
- **Tabs** (`role="tablist"`): Values [n to check] · Order match [1] · Certificates [1] · Timeline · Audit trail · Ask. Each count is a badge tinted by its status. The active tab has a 2px accent underline, ink text and weight 500.
- **Values tab:**
  - **Blockers box** (warn tint, shown while blockers remain). Title: "{n} things need a person before this can be approved". Each blocker is a button with a reason line that selects its field and scrolls to it.
  - **Filter:** a segmented control "All 10 / Needs a person 3", and keyboard hints `J` `K` value · `C` correct.
  - **Groups:** Parties, Invoice, Lines, Totals (uppercase group headers). The Lines group starts with a compact table (Item, Batch, Qty, Rate, Amount; tabular, flagged quantity in warn colour) followed by the field rows for editable line values.
  - **Field row** (10×16px padding, 8% rule):
    - Line 1: the label (12.5px muted) on the left; the confidence meter on the right.
    - Line 2: the **value as a button** (16px / 500, tabular), which sets it active on click or focus, and a secondary **Correct** button if the path is in `editable_paths` and the record is unsigned.
    - Then the check lines, linked by `aria-describedby`: an icon, then the bold word *Passed*, *Uncertain*, *Failed* or *Corrected*, a colon, and the text. For example: "**Uncertain:** Read at 61%. The printed 1,000 is struck through and 1,200 written by hand." / "**Failed:** PO-88213 ordered 1,000."
    - **Hover** gives a 4% ink fill and highlights the box. **Active** gives an accent-100 fill with an inset ring (2px accent on the left, 1px accent-300 around) and highlights the box.
    - **Correction form** (opens inline under the row): New value (labelled "read as {old}", autofocus), Reason, Your PIN (password, numeric, 6), then [Cancel] and primary [Save correction]. The note under it reads: "Recorded in the audit trail as your correction. The record's hash changes, so sign after correcting." Validation, in order: "Enter the value as it should read." → "Say why the reading is wrong." → "Enter your 6-digit PIN." Calls `POST …/corrections {path, text, reason, email, pin}`, which returns ReviewOut. Replace the whole review state with it, including the new `record_sha256`. After saving, the row shows "**Corrected:** by {who} from {old}. {reason}"; any blockers tied to that path disappear; toast: "Correction saved. The record changed, so it has a new fingerprint."
- **Order match tab:**
  - A fail badge "Does not match its order" and "Matched with **PO-88213.pdf** by order number" (a link to `counterpart_document_id`).
  - A table: Line, Ordered, Billed (bold, coloured), Rate ordered / billed, Result (icon and word).
  - A fail box with the discrepancy in words and what to do: "Line 2 bills 1,200 packs; the order is for 1,000. At ₹96.40 a pack that is ₹19,280.00 before tax. Correct the quantity if the page was misread, or reject the invoice."
- **Certificates tab:** "Certificates of analysis linked to this invoice by batch number." Each linked CoA is a card with marks: kicker "Batch AMX-2409-117 · line 1", the filename, a reason line and [Open certificate]. Batches without a CoA go in a dashed box: "No certificate yet for batches … They link here when uploaded."
- **Timeline tab:** an ordered list, each row in a `18px | 92px | 1fr` grid: a check icon, the stage word, then the local time with seconds and the detail ("2 checks failed · matched with PO-88213"). While the document is processing, subscribe to `…/events` and append stages live.
- **Audit trail tab:** each entry shows the label (500), the time on the right, and "{actor} · entry #{id}".
- **Ask tab:** "Questions here are answered from this document only." Then the thread (see Chat) and an input with [Ask]. Quotes highlight their box on this page directly. Submitting a new question opens Chat in a conversation scoped to this document.
- **Sign bar** (sticky at the bottom of the panel, 12×16px padding, 1px divider above):
  - **Unsigned:** the decision text ("DocForge cannot approve this on its own: 3 open checks." or "All checks pass. Ready to sign.") with `sha256 9f3ce1b0 … 0e1f2a71` in mono on the right (`title` = full hash). Below: `S` sign hint, secondary **Reject…** and primary **Approve…**.
  - **Signed:** a badge (Approved or Rejected), "Signed by {name} · {local time}", "Signature valid" (shield icon, ok colour, from `signature_valid`), "Meaning: “…”", the override or reject reason, and the full hash grouped in 8s.

**Sign dialog** (`POST …/review`):
- A kicker "Electronic signature" and the title "Approve invoice MS/24-25/04417" (or Reject).
- An outcome segmented control (Approve / Reject).
- "What your signature means": radios from ReviewOut `meanings` for the chosen outcome, for example "I approve this invoice for payment".
- **When approving with open blockers:** a warn box listing them and a required textarea "Why approve anyway? (required)", sent as `override_reason`.
- **When rejecting:** a required "Reason for rejecting" textarea.
- PIN entry (component 3), autofocused.
- A surface box: "You are signing the record with this fingerprint. If it changes before you sign, the signature is refused." with the full hash grouped in 8s.
- The error line (`role="alert"`), then [Cancel] and a primary **Sign and approve** or **Sign and reject**.
- **Body:** `{outcome, meaning, reason, override_reason, expected_record_sha256: <the hash shown>, email, pin}`.
- **Validation:** "Say why you approve while checks are still open." / "Say why you reject this invoice." / "Enter your 6-digit PIN."
- **401:** clear the PIN and show "Those details are not right. {n} tries left before your PIN is locked for 15 minutes." **429:** show the lock message.
- **409 stale:** swap the dialog body for the stale state. A refresh icon and the title "This record changed since you opened it". The text: "{who} corrected **{field}** at {time}. Nothing was signed. Reload to see the current record, then sign again." A `dl` shows "You saw" (the old hash, struck through) and "Now" (the new hash). Buttons: [Close] and primary **Reload record**, which re-fetches `/review`.
- **Success:** close the dialog, show the signed bar, and toast "Signed and recorded. Next in the queue: {next file}" with [Open next].
- Keyboard: `S` opens the dialog (approve) and `Esc` closes it.

**Document keyboard:** `J`/`K` move the active value, scrolling the panel (use `scrollTop`, not `scrollIntoView`); `C` corrects the active value; `S` signs; `Esc` closes the correction form, then the dialog, then returns to the queue.

**General documents** (no values) show only the page viewer, Timeline, Audit trail and Ask.

### 4. Documents (`/documents`)
- **API:** `GET /v1/documents?limit=&before=&doc_type=&stage=` returns `{items, next_before}`.
- **Header:** "Documents", "Every document in the organisation, newest first. Where each one is updates live.", and a primary **Upload documents** button.
- **Filters:** a type segmented control (All · Invoices · Orders · CoAs · General) and a "Where it is" select (Any stage · In progress or retrying · Finished · Failed). Keep the filters in the URL. On the right: "Showing n".
- **Table** (minimum width 860px): Document (the filename as a button, plus "Version n"), Type (tag), Where it is (stage badge, stage progress bars while in progress, then a detail line), Pages (right-aligned, "—" when unknown), Chat ("Can be asked" when `ready_for_chat`, "Not indexed" when processed, else "—"), Received (local time).
- **Detail lines:**
  - Retrying: "Storage did not answer. Trying again at 11:50; nothing to do."
  - Failed: the backend's `detail`, for example "Protected by a password. Upload a copy without the password."
  - Live: "Step 3 of 6, updating live".
- **Live updates:** open `…/events` for rows in progress, **at most 5 streams per person**. On 429, or after 10 minutes, poll `/timeline` instead.
- **Paging:** a centred secondary **Load more** (cursor `next_before`). When it is `null`, show "That is every document." Empty: "No documents match these filters."

### 5. Upload (`/upload`)
- **API:** `POST /v1/documents` (multipart `file`, `doc_type`), one request per file, then follow `…/events`.
- **Header:** "Upload" and "PDF, Word, Excel, PowerPoint or images (PNG, JPEG, TIFF). Up to 10 MB and 20 pages each."
- **Type picker:** "These files are" with a segmented control (Invoices · Orders · Certificates · General) and the hint "Choose General for anything that is only to be searched and asked about."
- **Drop zone:** a `<label for=file-input>`, 44×20px padding, 1.5px dashed border at 30% ink, 12px radius, holding an upload icon, "**Drop files here**" (17px / 600) and "or choose files. Many at once is fine; each is checked on its own." While dragging over it: an accent border and accent-100 fill. Behind it, a hidden `<input type=file multiple>`.
- **"This session" list** (`aria-live="polite"`, with a summary such as "3 ready · 2 in progress · 4 need you"). Each row is a `1fr | auto` grid: the name, then "size · type", then one of:
  - **Uploading:** a 6px progress bar with a 3px radius, maximum 420px, with `role=progressbar` and `aria-valuenow`, and an "Uploading" info badge.
  - **Processing:** the stage bars plus "Extracting · step 3 of 6", with the stage word as an info badge.
  - **Ready:** an ok badge and "Read and checked. Values are ready to review." (General: "Read and searchable.") with [Open].
  - **`created:false`:** a neutral "Already here" badge, "This exact file is already in DocForge. Nothing new was stored." and [Open existing].
  - **Refused** (fail badge, with the message in fail colour):
    - 422, unreadable or protected PDF: "Protected by a password. Remove the password and upload it again."
    - 415 for .xls, .doc or .ppt: "Older Office file (.xls). Save it as .xlsx and upload it again."
    - 415 for any other type: "This file type is not accepted. Use PDF, DOCX, XLSX, PPTX, PNG, JPEG or TIFF."
    - 413 for size: "Larger than 10 MB ({size}). Compress it or split it and upload again."
    - 413 for pages: "Has 34 pages; the limit is 20. Split it and upload the parts."
    - 409 for another type: "This file is already stored as {type}."
  - **503:** a warn "Not sent" badge, "The reading queue is full right now. Nothing was stored; try again in a minute." and [Try again].
- Check the extension and size on the client first to give instant refusals, but treat the server's answer as final.

### 6. Search (`/search`)
- **API:** `GET /v1/search?q=&mode=hybrid|keyword&k=&doc_type=&document_id=&collection_id=`.
- **Header:** "Search" and "Find passages across every document. Each result opens on its page with the passage outlined."
- **Search form** (`role="search"`): a search input (minimum height 40px, 15px text, placeholder "Words, numbers, a batch, a GSTIN…"), a segmented control **Words and meaning** (hybrid) / **Exact words** (keyword), and a type select. Debounce about 250ms. Keep `q`, `mode` and `type` in the URL. Drop stale responses (see Stale responses).
- **`words_only: true` banner** (warn, `role="status"`): "**Only exact words were matched.** Meaning-based search is unavailable right now, so passages that say the same thing in other words may be missing."
- **Results:** a status line "{n} passages for “q”, best first", then an ordered list of buttons (12×14px padding, 1px divider, 8px radius; hover is a 6% accent tint with an accent-400 border). Each shows the filename (500), type tag, "Page n" and, on the right, "Match 0.91". Below that, the passage (14.5px, tabular) with matched words in `<mark>` (accent-200, 3px radius, 0×2px padding), then "Show on page →". Clicking opens the document view at that page with the result's `boxes` drawn.
- **Empty:** "No passages contain “q”" / "Try fewer words, another spelling, or all types." With no query: "Type to search…". 429: "Too many searches in a minute. Try again in {N} seconds."

### 7. Chat (`/chat`, and inside documents and knowledge bases)
**APIs:**
- `POST /v1/chat/stream` (SSE; read it with `fetch` and a stream reader, as `readEvents` does in `web/src/lib/chat.ts`)
- `GET /v1/conversations`, `GET /v1/conversations/{id}`, `DELETE /v1/conversations/{id}`

**Grid:** `260px | 1fr`. Below 900px the conversation list hides; show it as a sheet from a button.

- **Conversations column:** h1 "Chat", [+ New question], then the list. Each item shows the title (13.5px / 500) and "{scope} · {when}". The current item has `aria-current` and an accent-100 fill.
- **Thread header:** the conversation title (20px) and a neutral tag "Scope: All documents | {filename} | Knowledge base · {name}".
- **Thread** (maximum width 760px, centred, 26px gap):
  - **Question:** "You · 11:32" (12px muted), then the question (21px / 600).
  - **Answer:** "DocForge · 11:32" and a status badge. The text has inline citation markers. Under it, a note box when needed, then the quote cards.
- **Status mapping** (badge kind, then text):
  - `supported`: ok, "Every statement checked" (check icon).
  - `partly_supported`: warn, "Partly supported: {n} statement left out". Note: "**Partly supported.** 1 statement was left out because its quote could not be found in the documents." Use `dropped_statements` and `dropped_citations`.
  - `not_found`: neutral, "Not in the documents" (minus icon). Answer text: "The documents do not say." Note: "**Not in the documents.** The 4 Lupex documents read do not mention an agreed payment term. Missing: {reason_detail.missing}. Administrators see this question in Unanswered questions; a contract or rate sheet would answer it."
  - `unsupported`: fail, "Withheld". The note explains `reason` in words, using the existing wording in `web/src/lib/chat.ts` for `no_passages`, `not_in_passages`, `quotes_not_found`, `figures_not_in_quotes`, `wording_not_in_passages`, `model_error` and `not_recorded`. When `reason_detail.held_back` is non-zero, add: "{n} passages were held back because they read like instructions to an AI."
  - When `words_only` is true, add the same exact-words notice as in Search.
- **Streaming:** show an ordered list of stages as they arrive: Searching → Reading {passages} passages → Checking quotes. Each has a 14px square with a ✓ when done; done and current stages are in ink, pending ones in neutral-500. A visually hidden `role="status" aria-live="polite"` region announces each stage, then "Answer ready: {status}". Show [Stop] with "Stopping keeps the answer in this conversation." (Stopping aborts the reader only; the server finishes and stores the answer.) When the answer arrives, move focus to it. On `event: error`, show a fail banner with its `detail`.
- **Composer** (pinned at the bottom): the label "Ask a question. Every statement in the answer rests on a quote you can open.", a two-row textarea (`Enter` asks, `Shift+Enter` adds a line) and a primary **Ask** button, disabled while streaming.
- **Conversation errors:** 409, "This conversation's document or knowledge base was deleted. Start a new question."; 422 if the scope would change; 429, "You can ask 20 questions a minute and 2 at once. Try again in {N} seconds."
- **Follow-ups** pass `conversation_id`. A citation click opens `/documents/{id}?page=n` with that citation's boxes and the quote banner.

### 8. Knowledge bases (`/collections`)
- **APIs:** `GET/POST /v1/collections`, `PATCH/DELETE /v1/collections/{id}`, `GET/POST /v1/collections/{id}/documents {document_ids}` (up to 500 at once), `DELETE …/documents/{document_id}`.
- **Header:** "Knowledge bases", "Group documents so questions are answered from that group only." and a secondary **+ New knowledge base** that opens an inline form: Name, What it holds, [Cancel] and primary [Make it]. On 409: "A knowledge base called “X” already exists. Names are unique, whatever their case."
- **Layout:** an auto-fit grid (minimum column 280px): the list on the left, the detail spanning two columns.
- **List items:** cards (12×14px padding, 10px radius) with the name (15px / 600), description, and "{n} documents · updated {when}". The selected card has a 9% accent tint and an accent-400 border.
- **Detail:**
  - The name as h2, the description, [Add documents] (a picker supporting multiple selection) and a ghost destructive **Delete**. Delete asks for confirmation: "The knowledge base goes; its {n} documents stay in DocForge. Conversations asked within it can no longer take follow-ups."
  - "Ask within this knowledge base" with [Ask], which opens Chat scoped to the collection.
  - A documents table with a ghost **Remove** per row (`aria-label="Remove {file} from {kb}"`), and "Removing a document here keeps it in DocForge."

### 9. Evals and cost (`/evals`)
- **API:** `GET /v1/evals`.
- **Header:** "Evals and cost", "Measured, not claimed. Each figure comes from the latest run of the eval suites against labelled documents.", and on the right "Last run {time} · {n} suites".
- **Metric cards** (an auto-fit grid, minimum 220px, gap 20px; cards with marks and 16px padding): the label (12.5px muted), the figure (36px / 600), the sub-line ("1,412 of 1,432 labelled fields"), then the target and an outcome badge (Met / Not met / Within budget). The four metrics are fields correct, wrong answers, cross-organisation leaks and cost per invoice.
- **Suites table:** Suite, Cases, Result, Target, Outcome. **Show missed targets plainly** with a fail badge "Not met"; it is what makes the page believable. Note under it: "A suite that misses its target is shown as missed."
- **Cost per item table:** Item, Tokens (average), Cost in ₹.

### 10. Unanswered questions (`/questions`, admin)
- **API:** `GET /v1/questions/unanswered` returns `{questions, by_reason}`.
- **Header:** "What people asked that the documents could not answer, and why. Often a sign of a document worth adding."
- **Reason chips:** "{total} in the last 30 days:" then pill toggle buttons (`aria-pressed`), each showing the count (600) and the reason in words. The pressed chip has an accent-100 fill and accent border. Reason words: *The documents do not say* · *Nothing matched in this scope* · *Its quotes were not found* · *Its figures were not in its quotes* · *Passages held back: they read like instructions to an AI*.
- **Table:** Question (500), Why it was not answered, What was missing ("—" when none), Read (document count, or "None"), Asked by, When, and a ghost [Conversation] link.

### 11. AI agents (`/agents`, admin)
- **APIs:** `GET/POST /v1/api-keys {name}`, `DELETE /v1/api-keys/{prefix}`, `GET /v1/agent-calls`.
- **Header:** "Agents such as Claude Code read DocForge through MCP with a read-only key. They can search, ask and read values; they cannot upload, correct or sign."
- **"Connect an agent" card** (with marks):
  - Endpoint: `{origin}/v1/mcp` in a mono chip with [Copy].
  - "Claude Code": the command `claude mcp add --transport http docforge {origin}/v1/mcp --header "Authorization: Bearer <key>"` in a mono block with [Copy].
  - The tools and limits line.
- **Keys:**
  - h2 with "{n} of 20 keys".
  - A form: "Name of the agent or person using it" and a primary **Make a key**. Validation: "Name the key after the agent or person who will use it." At 20 keys: "This organisation has 20 keys, the most allowed. Revoke one first."
  - On success, open the one-time secret dialog with the token from the reply only.
  - The table: Name, Key starts (`dfk_{prefix}…` in mono), Access ("Read only"), Made, Last used, and a ghost destructive **Revoke** (`aria-label="Revoke the key for {name}"`). Revoking asks for confirmation: "Agents using this key stop working at once. This cannot be undone; make a new key if you need one."
- **Latest calls table:** When, Key, Tool (mono), Outcome badge ("Answered", or warn "Refused: 4 calls already running (429)").

### 12. Audit log (`/audit`, admin)
- **APIs:** `GET /v1/audit?action=&actor=&target_type=&target_id=&from=&to=&before=&limit=`, `GET /v1/audit/filters`, `GET /v1/audit/export.csv`, `GET /v1/audit/verification`.
- **Header:** "Every action in the organisation, append-only and hash-chained." with a secondary **Export CSV** and a primary **Verify the chain**.
- **Verification** (`aria-live`):
  - While running: "Checking every entry's hash against the one before it…"
  - Consistent: an ok box (shield icon), "Verified: {entries} entries, chain intact."
  - Inconsistent: a fail box, "Broken at entry {first_bad_id}: {reason}."
  - When `anchors_checked = 0`, add: "No outside anchor was checked, so a complete rewrite of the log would not be detected by this check alone."
  - On 429: "Chain checks are limited to 6 a minute."
- **Filters:** Action (select from `/filters`), Who (select), From (date), "To, including" (date), and [Clear filters]. **Keep the filters in the URL.** `from` is inclusive; send `to` as **the day after** the last chosen day. The prototype shows the resulting URL on the right.
- **Table** (minimum width 900px): Entry (mono, right-aligned), When (local time with seconds), Who, Action (`action_label`, 500), On (`target_label`), Details. Never render `hidden_details`.
- **Export:** when the response has `X-DocForge-Truncated: true`, show "The export stopped at 10,000 rows. Narrow the dates to get the rest."
- **Paging:** "Load more" by cursor. Empty: "No entries match these filters."

### 13. Webhooks (`/webhooks`, admin)
- **APIs:** `GET/POST /v1/webhooks`, `GET /v1/webhooks/events`, `PATCH /v1/webhooks/{id} {active}`, `DELETE /v1/webhooks/{id}`, `POST …/{id}/secret`, `POST …/{id}/test`, `GET …/{id}/deliveries?before=&status=`, `POST …/deliveries/{delivery_id}/resend`.
- **Header:** "Tell other systems when something happens. Every delivery is signed with the webhook's secret in the DocForge-Signature header.", "{n} of 10" and a secondary **+ New webhook**.
- **New webhook form** (inline):
  - "Receiver address (https)".
  - The events as checkboxes from `/events`, each with the event name in mono and a description.
  - Validation: on 422 or a non-public address, "Use an https address reachable from the internet. Private and local addresses are refused (422)."; with no events, "Choose at least one event."; at 10, "This organisation has 10 webhooks, the most allowed."
  - On success, open the one-time secret dialog.
- **Webhook cards** (an auto-fit grid, minimum 360px; 14×16px padding, 10px radius; the selected card has an accent-400 border):
  - The URL in mono, **showing only the origin plus "/…"**, because the path and query can hold the receiver's token.
  - A switch (`role="switch"`, 38×22px, 11px radius; knob 16px white; accent when on, neutral-400 when off) with the text "On" or "Off".
  - Event tags, a last-delivery badge, and "Secret: {rotated at}".
  - Buttons: [Send test], [New secret…] and a ghost destructive [Delete], each with an `aria-label` naming the URL.
- **Button behaviour:**
  - Test on a disabled webhook (409): "Turn the webhook on before sending a test."
  - New secret: confirm first with "The old secret stops working now. Until the receiver at {url} has the new one, it will refuse deliveries as unsigned.", then open the secret dialog.
  - Delete: confirm with "Nothing more is sent to {url}. Its deliveries stay on record."
- **Deliveries** (for the selected webhook):
  - h2 "Deliveries to {url}" with a status segmented control (All · Failed · Retrying · Delivered).
  - Table: Event (mono), Status badge (Delivered / Failed / Retrying), Tries, Last answer (HTTP code), What happened ("Next try at 11:47", "The receiver says this address is gone"), When, and [Send again] on failed rows only.
  - Note: "A 2xx answer counts as delivered. Anything else is retried for about half an hour with the same DocForge-Event-Id."
  - Paging: "Load more".

---

## Interactions and behaviour

- **Value ↔ box linking:** keep one shared `hoveredPath` and `activePath`. Hovering or focusing a value row sets hovered or active, and its box highlights. Clicking a box makes its value active, switches to the Values tab and scrolls the panel so the row sits about 120px from the top. `J`/`K` move the active value. Flagged boxes stay visible even when "Show every box" is off.
- **Signing:** always send the `record_sha256` you displayed as `expected_record_sha256`. Any correction replaces the hash. The PIN is never kept after the request.
- **Streaming (SSE):** use `fetch` and `ReadableStream`, not `EventSource`. Handle a final event that arrives without a trailing blank line. Use an AbortController for Stop and on unmount.
- **Stale responses:** keep a load counter per view and render only the newest response.
- **Errors:** follow handover section 4. `detail` is a readable sentence; show it as is. For 422 with an array, show "Some of what was entered is not valid" and mark each field from `loc`. 401 anywhere redirects to `/login?next={path}`. 503: "try again shortly". 429: count down from `Retry-After`.
- **Toasts** confirm completed actions; they never carry errors that need reading (use alerts for those).
- **Motion:** box fill and switch knob animate over 120–150ms; the upload bar's width over 400ms. Nothing else moves. Respect `prefers-reduced-motion`.
- **Times:** show local time (for example "8 Oct, 11:46" or "Today, 11:44") and always put the UTC instant in `<time dateTime>`.
- **Money:** show amounts as printed, with Indian grouping (`₹4,12,877.60`, using `Intl.NumberFormat('en-IN')`).
- **Paging:** always "Load more" with cursors (`before` / `next_before`), never page numbers.

## Responsive behaviour

| Width | Change |
| --- | --- |
| 1280px and above | Full layout; the queue preview pane is shown |
| below 1280px | The queue preview pane hides |
| below 1100px | The sidebar becomes a 60px icon rail |
| below 1000px | The document view stacks (viewer 68vh, panel below) |
| below 900px | The chat conversation list hides (open it as a sheet) |
| below 760px | Queue rows become one column; the time moves under the reasons |

Wide tables scroll inside themselves. Status, queue and chat must stay usable at phone width.

## Accessibility (WCAG 2.2 AA)

- Every input is labelled; visually hidden labels are fine where the design shows none.
- Tables use `th scope="col"`.
- Row buttons carry `aria-label`s naming their row ("Revoke the key for …", "Delete the webhook to …").
- Use polite live regions for upload progress, chat stages and answers, chain verification and toasts.
- Move focus to new content: an opened secret, a new answer, the correction form.
- Keep focus when a row disappears.
- The listbox pattern applies to the queue, tablist to the document tabs, switch to webhook toggles, `aria-pressed` to reason chips, and progressbar to uploads.
- Status is never shown by colour alone.

## State management (per screen)

- **Queue:** items, selected index, load state (loading / ok / empty / error / rateLimited with retryAt / offline).
- **Document:** document, versions, review (ReviewOut), activePath, hoveredPath, the value filter (all / flagged), the editing path and its draft `{text, reason, pin}`, tab, zoom, showAllBoxes, citation (box and quote, from the URL), sign `{outcome, meaning, reason, override, pin, step: form|stale, error}`.
- **Documents and upload:** filters (in the URL), items plus cursor, a map of live stages by id (from SSE), uploads `[{file, docType, status, progress, stage, error, documentId}]`.
- **Chat:** conversations, the current conversation's messages, stream `{stage, passages}` or null, the composer text, and an AbortController.
- **Admin:** keys, calls, a one-time `secret` (component state only, cleared on Done), audit filters (in the URL) plus cursor plus verification result, webhooks, the selected webhook, the delivery filter plus cursor, and the pending `confirm`.
- **Global:** session user (name, email, role), theme, toast.

## Assets

- **Fonts:** IBM Plex Sans 400/500/600 and IBM Plex Mono 400/500 from Google Fonts. Self-host them with `next/font/google`.
- **Icons:** lucide-react at `strokeWidth={1.5}`.
- **No images.** The invoice page in the prototype is drawn in HTML for the demo; production uses `GET /v1/documents/{id}/pages/{n}`.

## Files in this bundle

- `README.md`: this document.
- `tokens.css`: every colour, type, spacing, radius, shadow and focus token, for light and dark, plus the registration-mark CSS.
- `prototype/DocForge App.dc.html`: the interactive design reference (open it over HTTP). The `prototype/support.js` and `prototype/_ds/…` files are needed only to run it.
- `reference/frontend-handover.md` and `reference/openapi.json`: the backend contract this design was built on.

## Suggested build order for Claude Code

1. Put the tokens in `globals.css`, set up fonts with `next/font`, add the theme toggle, and build the shared components (Button, Input, PinInput, Seg, Tag, StatusBadge, StageProgress, ReasonLine, Table, Dialog, SecretDialog, Toast, EmptyState, Alert).
2. Build the app shell, with role-aware navigation and the 403 page, and the sign-in screen.
3. Build the review queue with its keyboard support and all states.
4. Build the document view: page viewer and boxes (`geometry.ts`), value rows, corrections, the sign dialog with the 409 flow, then the other tabs.
5. Build Chat with SSE streaming and citations, then reuse it in the document Ask tab and in knowledge bases.
6. Build Documents with live stages, then Upload.
7. Build Search, then Knowledge bases.
8. Build the admin pages: Agents, Webhooks, Audit log, Unanswered questions. Then Evals.
9. Do an accessibility and responsive pass at 1280, 1024, 768 and 390px.
