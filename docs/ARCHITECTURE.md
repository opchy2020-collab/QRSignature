# QR Signature: architecture (Stage 1)

Last updated 2026-11-21.

## The decision that changed

The first Stage 1 build used React 19, Vite, Tailwind CSS v4, React Router, the `qr-code-styling` library, Vitest and Fontsource fonts. That code was lost, and the rebuild was done in a place where the npm package registry cannot be reached, so none of those could be installed.

So Stage 1 was rebuilt **with no runtime libraries at all**:

| Need | Used before | Used now |
| --- | --- | --- |
| Pages and routing | React + React Router | Plain HTML pages (one per address), shared header and footer assembled at build time |
| Styling | Tailwind CSS | One hand-written stylesheet, `assets/css/styles.css` (CSS variables for the design tokens) |
| QR code maker | `qr-code-styling` | Our own encoder, `src/ts/qr/encoder.ts` (byte mode, versions 1 to 40, all four error-correction levels, all eight masks) |
| Drawing the code | `qr-code-styling` | Our own SVG renderer, `src/ts/qr/render.ts` |
| Build | Vite | esbuild (one file, `scripts/build.mjs`) |
| Tests | Vitest | Node's built-in test runner, `scripts/test.mjs` |
| Fonts | Fontsource packages | The same fonts stored as files in `assets/fonts` |

**Why this is good for you now:** you can double-click `index.html`. No installation, no server, no dependencies to keep up to date, and nothing that can break when a package changes. The code is small enough to read.

**What it costs:** we own the QR encoder. That is a few hundred lines of well-known mathematics, and it has been tested against independent readers (see below), but it is our code to maintain. Later stages that need a server (uploads, accounts) will need a real backend anyway. At that point we can choose a framework again, and the logic in `src/ts/qr` and `src/ts/lib` can move over unchanged, because it does not touch the page.

## Folder map

```
index.html, create.html, ...   Finished pages (built from src/pages)
assets/css/styles.css          The whole design
assets/js/app.js               The program (built from src/ts/main.ts)
assets/fonts, assets/img       Fonts and the favicon
src/pages/*.html               Page text. Each starts with a --- block: title, description, page, nav
src/partials/                  layout.html, header.html, footer.html
src/ts/qr/                     The QR logic (no page code in here)
    encoder.ts                 Text to a grid of squares, with error correction and self-check
    payloads.ts                What goes inside a code for each type, with plain-language validation
    style.ts                   Shapes, templates, stage colors, limits
    render.ts                  Grid to SVG
    scan.ts                    The scan check
    export.ts                  PNG, SVG, copy, share-sheet helpers
src/ts/lib/                    color.ts, share.ts (share links), logo.ts (logo prepare), dom.ts
src/ts/ui/                     The screens: studio.ts (Create), home.ts, templates-page.ts, chrome.ts, icons, toasts
src/ts/main.ts                 Starts the right screen for the page (reads <body data-page="...">)
tests/                         Automatic tests
scripts/                       build.mjs, test.mjs, serve.mjs
```

## How a code is made

1. `payloads.ts` turns what the person typed into one text string (for example `WIFI:T:WPA;S:Cafe;P:secret123;;`) or explains what to fix.
2. `encoder.ts` turns the text into a grid of squares (`QrMatrix`). It picks the smallest version that fits. If there is room, it raises error correction for free. `selfCheck` can decode its own output, to catch mistakes.
3. `render.ts` draws the grid as one SVG string using the chosen shapes, colors and logo.
4. That **one SVG string** is used for the preview, for the SVG download, and (drawn onto a canvas) for the PNG download. So what you see is exactly what you get.
5. `scan.ts` reads the style (not the picture) and reports contrast, border, logo size and density.

## The "stage" (the signature design idea)

The colored panel behind a code takes on the color of the chosen style. Each template has a hand-tuned stage. For custom colors, a pale stage is worked out from the dot color. `stageColors()` picks text colors that stay at least 4.5 to 1 against the stage, and a test checks this for all templates and 400 random colors. CSS variables `--stage-from`, `--stage-to`, `--stage-glow`, `--stage-fg` and `--stage-soft` carry the values. In browsers that support `@property` the colors fade smoothly.

## Safety and privacy decisions

- Only `http:` and `https:` links are accepted. `javascript:`, `data:`, `file:` and other schemes are refused.
- A logo is accepted into the SVG only if it is a `data:image/png|jpeg|webp|gif;base64,...` URL made by our own canvas redraw. It is never an outside link. The redraw also removes hidden data (such as location) from the picture.
- Everything a visitor types is escaped for the format it goes into (Wi-Fi, vCard, `mailto:`, SVG text, HTML).
- The Create page builds HTML with escaping (`esc`) and sets text with `textContent` wherever user text is shown.
- No cookies, no analytics, no outside requests (fonts and icons are stored locally). `sessionStorage` carries the web address from the home page's quick form to Create, and is cleared when read.
- Share links use `target="_blank" rel="noopener noreferrer"`.

## Decisions to confirm on real devices

- Wi-Fi codes do not wrap an all-hex password in quotes. Android's own codes do not either. A few phones may read quotes literally. Test with a hex-looking password.
- SMS codes use `sms:number?body=`. Test on iPhone and Android.
- Instagram has no web share link, so phones get the share sheet and computers get the image saved.
- Contact codes use vCard 3.0. Some phones ignore fields they do not know.

## How it was checked

- `npm test`: 44 automatic tests (content rules, escaping, encoder capacity, all eight masks, round-trip decoding, SVG safety, share links, scan check, stage contrast).
- `npm run typecheck`: strict TypeScript, no errors.
- Every downloaded code (PNG at 512, 1024 and 2048, SVG, every dot shape, gradient, logo, each content type) was read back with an independent QR reader (the ZXing-based decoder in OpenCV). 
- Scripted browser run (Chrome): 99 checks covering typing, validation, tabs, templates, colors, logo, downloads, copy, share links, hand-off from home to Create, filters, and the phone menu. No console errors or sideways scrolling on any page at 1280 px and 390 px.
- Accessibility pass: every control has a name, headings do not skip, text contrast is at least 4.5 to 1 outside the stage, and every keyboard stop shows a focus ring.

**Not verified:** scanning with real phones (iPhone and Android), Safari and Firefox, the phone share sheet, Instagram sharing, and a screen reader. These are on the checklist in `docs/STAGE-1-CHECKLIST.md`.

## Swapping the heading font

Headings use Lora (the example site used Playfair Display). To use Playfair Display: download the WOFF2 or WOFF file from Google Fonts, put it in `assets/fonts`, add an `@font-face` for it at the top of `assets/css/styles.css`, and change `--font-head`. Keep the file in the folder so no request goes to Google.
