<div align="center">

# PDFx

**One file. Many documents. Still a PDF.**

<br>

[![Download](https://img.shields.io/badge/Download-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pub-2f99e567a5f04aefb5e8cb75acb90ef7.r2.dev/PDFx.zip)&nbsp;
[![Live Demo](https://img.shields.io/badge/Live%20Demo-4285F4?style=for-the-badge&logo=google%20chrome&logoColor=white)](https://pdfx.zip)
<br>
<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-2e7d32?style=flat-square)](LICENSE)
&nbsp;
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-555?style=flat-square)](#)
&nbsp;
[![Format spec](https://img.shields.io/badge/format-spec-e08a00?style=flat-square)](SPEC.md)

<br>

<img src="assets/pdfx.png" alt="PDFx viewer" width="820">

</div>

<br>

## What it is

PDFx is an open, backwards compatible extension of PDF that bundles many documents into a single file, plus a minimal desktop viewer for macOS, Windows, and Linux.

The files produced are fully valid PDFs: open them anywhere and every page shows in sequence. Open them in PDFx and it splits back into the original documents. Plain single PDFs work as they are.

Drag and drop `.pdf` files, images or folders anywhere in the window. Each document renders as a horizontal strip of pages, and documents stack vertically. Reorder or remove them, then **Export PDF** to save the whole collection as one file.

See [SPEC.md](SPEC.md) for the format. It is short: the entire trick is one embedded JSON manifest.

## How to run

Built with Electron, Vite, TypeScript, and React. PDF rendering by [pdf.js](https://mozilla.github.io/pdf.js/), assembly by [pdf-lib](https://pdf-lib.js.org/).

```bash
yarn              # install
yarn dev          # run in development
yarn dev:web      # run on the web
yarn build:mac    # build:win for windows, build:linux for linux
```

_The AI assistant needs a provider API key: copy `.dev.vars.example` to `.dev.vars`, and set your key (Google, Anthropic, or OpenAI)._

## License

MIT
