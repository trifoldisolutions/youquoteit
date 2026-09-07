# Project Journal

<!--
Entry template:

## YYYY-MM-DD
- What changed
- Why
-->

## 2026-09-06
- Bootstrapped the project: Express + EJS + Mongoose + Tailwind scaffold.
- Set up three facades (public, app, admin), the dev_resources internal task board, git, VS Code auto-run tasks, and the `.vbs` launcher.
- Why: starting point for the youquoteit app, following the standard project template.

## 2026-09-07
- Built the core "quote stage" screen at `/app` (`views/app/index.ejs`), replacing the placeholder page: full-viewport layout with a header (brand name, profile/menu buttons), a centered quote block (author row, typewriter-animated quote text, a views/likes/comments/screenshots stats row), and a transport footer (loop-current, prev/next, play/stop, screenshot, fullscreen).
- `routes/app.js` now feeds the view 6 sample quotes and an 8-entry `THEMES` list as temporary in-memory stand-ins for the future quotes API.
- Added an 8-theme system in `src/input.css` — daylight, midnight, ember, dawn, candy, mono, harbor, forest — as CSS custom properties under `[data-theme="..."]`, mapped into Tailwind via `@theme inline` (`color-surface`, `color-ink`, `color-accent-50..950`, `font-display`/`font-sans`). Theme-switcher CSS (`.theme-dot`) and JS (`initThemeSwitcher` in `public/js/app.js`, persists choice to `localStorage`) are wired up but not yet exposed in the markup — no `.theme-dot` buttons in the menu yet.
- `public/js/app.js`: a `Typewriter` class (type/erase/reverseErase with jittered per-character timing, pre-reserved box height so line wraps never reflow already-typed lines); an autoplay quote deck (holds each quote ~7s, retypes it 3x before advancing, loop-current toggle, prev/next with a stand-in pending-spinner delay); a Stop/Play control that settles cleanly (reverses an in-flight erase rather than cutting it off, waits for typing to finish) instead of interrupting mid-animation; a screenshot exporter (html2canvas) that builds an off-screen 1080x1080 clone of the brand + quote + stats (icons re-inlined from shadow DOM, author-row rule repositioned by measured pixel offsets) rather than capturing the live page; and a fullscreen/zen mode driven by an `is-zen` class with a `position:fixed` CSS fallback for contexts where the real Fullscreen API is blocked.
- Added Google Fonts (Kaushan Script, Open Sans) and the iconify-icon / html2canvas script tags to the view.
- Added `src/imgs/` with numbered design-reference screenshots (mockups guiding this build; not used programmatically) and `public/output.css` (compiled Tailwind output).
- Added `dev_resources/tasks.json` as the internal task board; currently one open task — add a per-quote screenshot-taken counter.
- Why: flesh out the core "quote of the moment" viewing experience — the heart of the app — before wiring it to real data, auth, and the theme-switcher UI.
