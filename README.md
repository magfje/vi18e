# v(i18)e

A modern translation editor for developers. Built with Electron, React, and TypeScript.

![License](https://img.shields.io/badge/license-MIT-green)

## What it does

v(i18)e lets you open, edit, and save translation files with a clean three-panel interface:

- **Left** — catalog list with filter tabs (All / Untranslated / Translated), search, and sortable columns
- **Center** — source text + translation editor with placeholder mismatch warnings
- **Right** — translation suggestions from DeepL and your local Translation Memory

Changes are tracked in a local SQLite Translation Memory (TM) and reused as suggestions on future translations.

## Supported formats

| Format         | Extensions    | Notes                                                           |
| -------------- | ------------- | --------------------------------------------------------------- |
| Gettext PO     | `.po`, `.pot` | Full support: fuzzy flag, translator comments, plurals, context |
| Format.js JSON | `.json`       | React-intl translations; requires a reference (source) file     |

## Features

- **DeepL integration** — automatic translation suggestions with smart ICU placeholder handling; complex plural forms (`{count, plural, one{# item} other{# items}}`) are decomposed so the words get translated while the structure is preserved
- **Translation Memory** — exact and fuzzy matches from your own translation history, with per-entry delete
- **Placeholder validation** — warns on mismatch between source and translation for ICU (`{var}`), printf (`%s`, `%1$s`), and Python-named (`%(name)s`) placeholders

## Getting started

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

## Configuration

DeepL and other settings are stored via `electron-store`. Access them through **Preferences** in the toolbar.

| Setting          | Key                          | Default   |
| ---------------- | ---------------------------- | --------- |
| DeepL API key    | `translator.deepl.apiKey`    | —         |
| DeepL formality  | `translator.deepl.formality` | `default` |
| DeepL server URL | `translator.deepl.serverUrl` | auto      |

A free DeepL API key (`:fx` suffix) works fine.

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/) (Stone / Emerald theme, JetBrains Mono)
- [Zustand](https://zustand-demo.pmnd.rs/) for state, [Immer](https://immerjs.github.io/immer/) for immutable updates
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for the local TM database
- [@tanstack/react-virtual](https://tanstack.com/virtual) for the virtualized catalog list
- [deepl-node](https://github.com/DeepLcom/deepl-node) for the DeepL SDK

## License

MIT
