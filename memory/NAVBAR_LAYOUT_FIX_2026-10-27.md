# Navbar Layout Fix - 2026-10-27

## Request

Fix the shared navbar at desktop and mobile widths without changing routes,
labels, item order, or active-state styling. Record the work and push the
navbar change to `main`.

## Diagnosis

- The original header was a single flex row using `justify-between`, with no
  explicit minimum gap between the brand, a non-shrinking search box, and nav.
- The desktop search occupied a fixed 256px and grew to 320px on focus. The
  nav was `flex-1`, `min-w-0`, and `overflow-x-auto`, while each link used
  `shrink-0`. This allowed nav items to be clipped inside a scrollable strip
  rather than making the entire header fit.
- The brand itself had no explicit `shrink-0`. At narrow sizes the wordmark
  used `hidden sm:block`, so it disappeared on mobile.
- Navigation labels were controlled by the `2xl` CSS viewport breakpoint,
  not browser-specific logic. Zoom and operating-system scaling can change the
  effective CSS viewport and therefore select different CSS layouts.
- The source had an Account link and notification control, not a Submit nav
  link. A Submit button seen in one screenshot was not part of this shared
  navbar and may have been a page CTA or a different deployed build.
- The mobile menu did open on tap in the browser inspected; no covering element
  or duplicate event handler was found. However, the button was 40x40px and
  lacked `type`, accessible label, expanded state, and control relationship.
  The menu was rendered in-flow inside a fixed, backdrop-filtered header, with
  no outside-tap/Escape handling or background scroll lock. The mobile logo
  existed, but its text wordmark was hidden.

## Final desktop measurements

Measurements are CSS viewport pixels from the rendered navbar. The document
had no horizontal overflow in Chrome or Edge at the tested sizes.

| Viewport | Brand | Search slot | Nav | Actions | Labels |
|---:|---:|---:|---:|---:|---|
| 768 | 137 | 44px search button | 340 | 42 | Icons |
| 1024 | 137 | 280 | 340 | 42 | Icons |
| 1180 | 137 | 280 | 340 | 42 | Icons |
| 1280 | 137 | 280 | 340 | 42 | Icons |
| 1440 | 137 | 280 | 340 | 42 | Icons |
| 1536 | 137 | 280 | 907 | 102 | Icons and labels |
| 1920 | 137 | 280 | 907 | 102 | Icons and labels |

Chosen tiers:

- Below 768px: mobile wordmark, logo, and menu button.
- 768-1023px: brand, icon-only navigation, compact-search button, actions.
- 1024-1535px: brand, bounded search input, icon-only navigation, actions.
- 1536px and above: brand, bounded search input, icon-and-label navigation,
  actions.

The labeled nav measures about 907px. Together with the 137px brand, 280px
search and 102px actions, plus three 16px gaps and 48px horizontal padding,
the required width is about 1522px. A 1536px tier therefore fits; the former
2xl breakpoint was too late for the intended content width in some viewport
configurations.

## Changes made

- Replaced the shared header row with explicit responsive desktop and mobile
  layouts. Brand and action slots do not shrink; the search is flexible,
  bounded at 280px and uses `min-width: 0`; nav items no longer live in an
  internal horizontal scroller.
- Added the 768px compact-search overlay tier and the 1536px labeled-nav tier.
- Added the mobile three-slot layout with a centered, truncatable KELUCALLS
  wordmark, 44px logo, and 44x44px menu button.
- Moved the mobile drawer and compact search overlay into a portal at
  `document.body`, above header/page stacking contexts.
- Added `aria-label`, `aria-expanded`, `aria-controls`, Escape handling,
  outside-tap closing, route/path close behavior, viewport close behavior,
  body scroll locking, and focus handoff for the mobile menu.
- Kept existing nav routes, labels, item ordering, and active-state classes.
- Kept the existing optional `SearchBox mobile` call compatible while making
  the shared search field fill its responsive slot.
- Added Playwright regression coverage and Chrome/Edge projects. Tests verify
  the target viewport widths, intermediate widths representing 125%/150% zoom
  at equivalent CSS widths, document overflow, bounding-box intersections,
  mobile touch open/close, search overlay, scroll lock, and browser errors.
- Playwright screenshots are written to ignored `test-results/` output:
  320, 360, 390, 430, 768, 1024, 1180, 1280, 1440, and 1920px, plus the 390px
  mobile drawer, in both Chrome and Edge.

## Files changed for this task

- `.gitignore` - ignore generated Playwright `test-results/`.
- `package.json` and `package-lock.json` - add Playwright test dependency and
  `test:navbar` script.
- `playwright.config.ts` - configure Chrome and Edge and start/reuse the
  development server.
- `src/components/navbar.tsx` - shared responsive navbar/search/drawer.
- `tests/navbar-layout.spec.ts` - responsive layout and touch regression test.

The worktree also contained unrelated pre-existing changes. They were not
included in the navbar commit. The pre-existing neutral-zero ROI adjustment in
`navbar.tsx` was preserved separately from this navbar-layout change.

## Verification

- `npm run test:navbar`: passed in Chrome and Edge. The final stable test
  opens the drawer by touch and closes it with Escape, and exercises the
  compact-search overlay. An earlier passing iteration also exercised outside
  tap and route selection; these interactions are implemented, but are not
  included in the final stable automated test after long route waits made it
  flaky.
- `npm run typecheck`: passed.
- Targeted ESLint on navbar, homepage, test, and Playwright config: passed.
- `git diff --check`: passed.
- Browser `pageerror` and console-error capture: no errors in Chrome or Edge.
- Mobile `elementFromPoint()` hit the menu button itself; measured tap target
  is 44x44px. The drawer opened by touch, showed the search and links, locked
  body scrolling, and closed with Escape/outside tap.
- The suite tests equivalent CSS viewport widths for zoom but does not change
  the browsers' actual zoom setting. Safari/iOS and a physical device were
  unavailable on the Windows host.

## Screenshot paths

Screenshots are local ignored artifacts and are not included in Git:

- `test-results/navbar-layout-navbar-fits--53690-le-drawer-responds-to-input-chrome/`
- `test-results/navbar-layout-navbar-fits--53690-le-drawer-responds-to-input-msedge/`

Each folder contains the ten requested viewport screenshots and the 390px
drawer screenshot.
