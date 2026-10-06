# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Appium Inspector: a React app for visually inspecting apps under test via an Appium server. It ships as three distinct build targets from one shared codebase:

1. **Electron desktop app** (macOS/Windows/Linux)
2. **Standalone web app** (browser)
3. **Appium server plugin** (`plugins/`, published separately; its build reuses the browser build under a `/inspector` base path)

## Commands

```bash
npm ci                    # install deps (requires Python + a C/C++ toolchain for node-gyp)

npm run dev:browser       # dev server for browser/plugin target
npm run dev:electron      # dev server for Electron target

npm run test              # lint + unit + integration (what CI runs)
npm run format:check      # oxfmt check
npm run test:unit         # vitest run unit
npm run test:integration  # vitest run integration
npm run test:e2e          # currently non-functional (TODO in package.json)

# single test file
npx vitest run test/unit/utils-source-parsing.spec.js

npm run build:browser     # -> dist-browser/
npm run build:plugin      # -> plugins/dist-browser/
npm run build:electron    # -> dist/
npm run pack:electron     # -> release/ (desktop installers; macOS needs code-signing env vars)

npm run lint               # oxlint (npm run lint:fix to auto-fix)
npm run format             # oxfmt -w
```

When developing against a real Appium server in dev mode, start the server with `--allow-cors` — the dev server runs on a different origin and sessions will otherwise fail CORS.

When testing through the Appium server plugin (`appium server --use-plugins inspector`, installed from `plugins/` via a local symlink), `npm run build:plugin` is enough — the server serves `plugins/dist-browser` directly, no restart needed — **but the browser keeps running the previously loaded bundle until a hard reload (`Cmd+Shift+R`)**. Before judging whether a fix works, confirm in DevTools that `[...document.scripts].map((s) => s.src)` lists the same `assets/index-*.js` as `plugins/dist-browser/index.html` (2026-10-05: a coordinate-offset bug that had already been fixed kept reproducing only because the old bundle was still loaded).

## Architecture

### Shared core + per-target polyfills

Almost all code lives in `app/common/renderer/` and is shared across all three build targets. Behavior that differs per target (settings storage, opening external links, theme/language sync with the OS, session-file-opened-via-OS handling) is abstracted behind the `#local-polyfills` import alias, defined differently in each Vite config:

- `electron.vite.config.mjs` points it at `app/electron/renderer/polyfills.js`, which proxies to `window.electronIPC` (bridged from `app/electron/preload/preload.mjs` via Electron IPC to `app/electron/main/`).
- `vite.config.mjs` points it at `app/web/polyfills.js`, which uses `localStorage` and `window.open`.

`app/common/renderer/polyfills.js` re-exports from `#local-polyfills` and layers setting defaults on top. Because the alias resolves differently per config, `#local-polyfills` imports are excluded from tsconfig path resolution and need an `eslint-disable-line import-x/no-unresolved`. When adding a platform-dependent capability, add it to both polyfill implementations, not just one.

### Electron process split

- `app/electron/main/` — main process (window creation in `windows.js`, menus, auto-updater, i18n setup, debug logging).
- `app/electron/preload/preload.mjs` — the only bridge between main and renderer; exposes `window.electronIPC` methods (`invoke`/`send` over specific channel names like `settings:get`, `electron:openLink`).
- `app/electron/renderer/` — renderer-side Electron-specific polyfill implementation (see above).

### Renderer: Redux + two pages

The app is two routed pages (`/` → SessionBuilder, `/inspector` → SessionInspector), driven by Redux Toolkit (`app/common/renderer/store.js`):

- `actions/` and `reducers/` each have one file per page (`SessionBuilder.js`, `SessionInspector.js`) combined via their respective `index.js`.
- `containers/` connect Redux state/actions to the top-level page components in `components/SessionBuilder/` and `components/SessionInspector/`.
- Feature areas within each page are further split into subfolders (e.g. `SessionInspector/{CommandsTab,GesturesTab,RecorderTab,SourceTab,SessionInfoTab,Screenshot,Header}`, `SessionBuilder/{ServerDetails,CapabilityBuilderTab,CapabilityJSON,AttachToSessionTab,SavedCapabilitySetsTab,AppSettings}`).

### Appium/session logic

`app/common/renderer/lib/appium/` holds the driver session lifecycle (`session-starter.js`, `session-driver.js`, `session-element.js`, `inspector-driver.js`) — this is the layer that actually talks to the Appium server via `webdriver`/`@wdio/protocols`.

`app/common/renderer/lib/client-frameworks/` generates copy-pasteable client code snippets (Java/JUnit4/5, Python, Ruby, .NET/NUnit, JS/WebdriverIO, Robot, Oxygen) for the current session/commands, dispatched via `map.js`.

### Locators and source parsing

`app/common/renderer/utils/locator-generation/` generates locator strings per strategy (XPath, UIAutomator, predicate, class-chain, "simple"). `source-parsing.js` parses the app's page source (via `cheerio`/`@xmldom/xmldom`/`xpath`) into the tree the Source/Screenshot tabs render.

### Localization

UI strings must go through i18next (`t('key')`), sourced from `app/common/public/locales/en/translation.json`. New keys are added in English only; translations sync automatically via Crowdin — don't hand-edit non-English locale files.

## Conventions

- Linting is `oxlint` (`oxlint.config.mjs`) and formatting is `oxfmt` (`oxfmt.config.mjs`) — upstream replaced eslint/prettier; `npx eslint`/`npx prettier` are not the project's tools (prettier reports pre-existing "violations" on untouched files).
- React Compiler (`babel-plugin-react-compiler`) is enabled in both Vite configs — avoid manual `useMemo`/`useCallback` micro-optimizations that fight the compiler.
- CSS Modules (`*.module.css`) are used for component-scoped styles alongside antd components.

## Fork customizations (Flutter)

This fork (`masaaki-hori/appium-inspector`) adds Flutter support on top of upstream. It works together with the customized `appium-flutter-driver` and the app-side `appium-handler` package. The cross-repo protocol (`foundBy` strings, `performActions` action types, page-source attributes, the `submitted` flag) is defined in the **appium-handler repo's `CLAUDE.md` ("Protocol contract")** — check it before renaming any of those literals; the reasons behind it are in appium-handler's `docs/design-notes.md`.

- **Flutter session detection**: `featureCaps.automationName === DRIVERS.FLUTTER` in actions, `InspectorDriver#isFlutterSession()` in `lib/appium/inspector-driver.js`. Flutter sessions start in the `FLUTTER` context (`FLUTTER_CONTEXT` in `constants/session-inspector.js`), not `NATIVE_APP`, and skip WebView-hybrid context lookups.
- **Tap recording**: `tapAtCoordinates` → `tapFlutterWidgetAtCoordinates` sends a coordinate-based `performActions`; the device resolves the widget and returns `{foundBy, value}`, which `parseFlutterFinderFromResponse` attaches to the recorded action (`RECORD_FLUTTER_FINDER`) so generated code uses a widget finder instead of coordinates.
- **Right-click context menu** (Flutter only, TAP_SWIPE mode, `Screenshot.jsx`/`ScreenshotImgWithOverlays.jsx`): `checkExistence` / `enterText` / `checkText` / `tapDirect`. The `SCREENSHOT_INTERACTION_MODE` values in `constants/screenshot.js` double as the `performActions` action `type`. Handlers live in `actions/SessionInspector.js` (`verifyElementExistsAtCoordinates`, `enterTextAtCoordinates`, `checkTextAtCoordinates`, `tapDirectElementAtCoordinates`, `tapElementAtCoordinates`). Take coordinates from the `contextmenu` event (`rightClickCoordsRef`), not the hover `x`/`y` state, which is already `null` once the dropdown opens.
- **Overlapping widgets**: `utils/element-hit-testing.js#findAllElementsAtPoint` parses `bounds="[x1,y1][x2,y2]"` and returns every candidate most-specific-first; picking one in the submenu sends its page-source `id` as `elementId`.
- **Dart code generation**: `dart-integration-test.js` and `dart-patrol.js` (registered in `map.js`) share `dart-common.js#getFlutterFinderExpression`. `byType` `<Type>#<N>` → `find.byType(Type).at(N)`, where N is appium-handler's live, finder-order index (the page source's `typeIndex` attribute) — *not* the position among same-typed page-source nodes. `byFieldLabel` `<Type>|<label>` → `find.widgetWithText(Type, "<label>")`.
- **JS code generation**: `js-wdio.js` emits `retryFlutterAction(...)` calls. Its boilerplate (`wrapWithBoilerplate`) must stay app-independent: the generated code only calls `log`, `dumpPageSourceOnFailure`, `retryFlutterAction` and `promptForInput` (plus a few generic utilities for hand-editing). App-specific helpers (coach-mark dismissal, finding buttons by fixed position, ...) belong in the app's own test project; a unit test keeps such values out (one app's helpers were removed from here on 2026-10-06).
- **Tests**: `test/unit/client-frameworks-dart.spec.js`, `client-frameworks-js.spec.js`, `utils-element-hit-testing.spec.js`.

### Syncing with upstream

Upstream is merged in regularly. Upstream changes can break Flutter features **without any conflict, build error or failing test**: once upstream moved `state.inspector.automationName` to `state.inspector.featureCaps.automationName`, leaving the Flutter code reading an always-`undefined` field; and in the 2026-09 merges, the fork's old JSX survived next to upstream's rewritten layout in `SessionInspector.jsx` and `Screenshot.jsx`, rendering the screenshot twice so every click mapped to the wrong device coordinate. After every upstream merge:

1. Grep for the Flutter call sites listed above and confirm they still read the right state/props (including `onContextMenuActiveChange` reaching `ScreenshotImgWithOverlays`).
2. `npm run test`.
3. Check the fork-changed `.jsx` files for components rendered more than once and for `styles.xxx` classes missing from their `.module.css` (both signs of a stale block). Requires the `upstream` remote (`git fetch upstream`). Expected output today: only the three Modals/Inputs in `ScreenshotImgWithOverlays.jsx` and the two `Splitter.Panel`s in `SessionInspector.jsx`.
   ```bash
   jsx=$(git diff --name-only upstream/main...main -- '*.jsx')
   # components rendered more than once (comment lines excluded)
   for f in $jsx; do [ -f "$f" ] && grep -v -E '^\s*(//|\*|/\*)' "$f" | grep -o "<[A-Z][A-Za-z.]*" | sort | uniq -c | awk -v f="$f" '$1>1 {print f": "$2" x"$1}'; done
   # styles.xxx missing from the matching .module.css
   for f in $jsx; do css="${f%.jsx}.module.css"; [ -f "$css" ] || continue; for c in $(grep -o 'styles\.[A-Za-z0-9_]*' "$f" | sed 's/styles\.//' | sort -u); do grep -q "\.$c\b" "$css" || echo "$f: styles.$c not in $(basename "$css")"; done; done
   ```
4. `npm run build:plugin`, hard-reload the browser, open a Flutter session and check: one screenshot (`document.querySelectorAll('#screenshot').length === 1` in DevTools), highlights line up with widgets, the right-click menu lists overlapping candidates, and a recorded tap produces a widget locator.
