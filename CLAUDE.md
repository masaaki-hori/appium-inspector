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
npm run test:lint         # eslint
npm run test:format       # prettier check
npm run test:unit         # vitest run unit
npm run test:integration  # vitest run integration
npm run test:e2e          # currently non-functional (TODO in package.json)

# single test file
npx vitest run test/unit/utils-source-parsing.spec.js

npm run build:browser     # -> dist-browser/
npm run build:plugin      # -> plugins/dist-browser/
npm run build:electron    # -> dist/
npm run pack:electron     # -> release/ (desktop installers; macOS needs code-signing env vars)

npm run lint               # eslint --fix
npm run prettier            # prettier -w
```

When developing against a real Appium server in dev mode, start the server with `--allow-cors` — the dev server runs on a different origin and sessions will otherwise fail CORS.

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

- Import ordering is enforced by `eslint-plugin-simple-import-sort` — run `npm run lint` rather than hand-ordering imports.
- Prettier config (in `package.json`): no bracket spacing, `printWidth: 100`, single quotes.
- React Compiler (`babel-plugin-react-compiler`) is enabled in both Vite configs — avoid manual `useMemo`/`useCallback` micro-optimizations that fight the compiler.
- CSS Modules (`*.module.css`) are used for component-scoped styles alongside antd components.
