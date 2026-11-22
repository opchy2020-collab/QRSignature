# QR Signature (Stage 1)

**Create. Customize. Share.**
Make a QR code for a link, Wi-Fi, a contact card and more. Choose colors and shapes, check that it scans, then download it or share it. Everything happens in your browser. Nothing is uploaded.

This is **Stage 1 of 5**. It is finished and waiting for your testing. Please do not start Stage 2 until you have tested it and said it is approved.

---

## 1. Open it (30 seconds, nothing to install)

1. Open this folder in File Explorer.
2. Double-click **`index.html`**.
3. It opens in your browser. You can now make codes.

If it opens in a browser you do not like, right-click `index.html`, choose **Open with**, then pick Chrome or Edge.

The site also works with no internet, except the Facebook, WhatsApp, LinkedIn and X share buttons, which open those websites.

## 2. Try this first (5 minutes)

1. On the home page, type `example.com` in the "Try it now" box, pick a style, and press **Download PNG**.
2. Open the picture and **scan it with your phone's camera**. It should open example.com.
3. Press **Open the studio** and make a **Wi-Fi** code for your own network. Scan it with a phone. It should offer to join the network.
4. Add a logo on the **Logo** tab. Scan again.

The full test list is in [`docs/STAGE-1-CHECKLIST.md`](docs/STAGE-1-CHECKLIST.md).

---

## What is in this folder

| What | Where | Notes |
| --- | --- | --- |
| The finished site | `index.html`, `create.html`, `templates.html`, `how-it-works.html`, `about.html`, `privacy.html`, `terms.html`, `404.html` | Double-click `index.html` |
| Look and feel | `assets/css/styles.css` | The warm orange and cream design |
| The program | `assets/js/app.js` | Built from `src/ts`. Do not edit by hand |
| Fonts, logo | `assets/fonts`, `assets/img` | Stored here. Nothing is loaded from Google |
| Source code | `src/ts` (logic and screens), `src/pages` (page text), `src/partials` (header, footer) | Only needed if you change the site |
| Tests | `tests/` | 44 automatic tests |
| Build tools | `scripts/` | Used by the commands below |
| Notes | `docs/`, `THIRD-PARTY-NOTICES.txt` | Design decisions and licences |

## Changing the site (optional, for later)

You only need this if you want to change the text or the code. Everything above works without it.

1. Install **Node.js** (the "LTS" version) from https://nodejs.org. Restart your computer if it asks.
2. Open a terminal in this folder (in File Explorer, click the address bar, type `cmd`, press Enter).
3. Run these once: `npm install`
4. Then, any time you change a file in `src`:
   - `npm run build` rebuilds the pages and `assets/js/app.js`
   - `npm test` runs the automatic tests
   - `npm run typecheck` checks the code for mistakes
   - `npm run serve` shows the site at http://localhost:4173

## What works in Stage 1

- Nine code types: website link, plain text, Wi-Fi, contact card, email, phone call, text message, WhatsApp chat, social profile.
- Plain-language checks as you type. Unsafe links (`javascript:`, `data:` and similar) are refused.
- Design studio: 12 templates, 6 dot patterns, 3 corner frames, 2 corner centers, one color or a gradient, background or transparent, your own logo or round profile picture, empty border, error correction.
- A scan check that explains what could stop a phone from reading the code.
- Downloads: PNG (512, 1024 or 2048 pixels), SVG, and copy image.
- Sharing: Facebook, WhatsApp, LinkedIn and X (real share links), Instagram (phone share sheet, or the image is saved on a computer), copy link, share image.
- Pages: Home, Create, Templates, How it works, About, Privacy (draft), Terms (draft), and a 404 page.

## What is not built yet (on purpose)

File uploads and sharing links (Stage 2), video, passwords and link expiry (Stage 3), accounts and a dashboard (Stage 4), editable codes, scan counts, bulk codes and subscriptions (Stage 5). The home page lists these as "Not built yet".

## Privacy in this version

No accounts, no cookies, no analytics, no outside fonts, and nothing you type is sent anywhere. The Privacy page says so. If a later stage adds any of these, the Privacy page must be changed first.

## Good to know

- **Fonts:** headings use **Lora**. Your example site used Playfair Display. It was not available to me offline, and Lora is similar. See `docs/ARCHITECTURE.md` if you want to swap it.
- **Hero video:** the example site had a video behind the top banner. This site uses a colored banner instead, so the page loads fast and works offline.
- **Privacy and Terms are drafts.** A lawyer must review them before the site is public.

Licences for the fonts and icons are in `THIRD-PARTY-NOTICES.txt`.
