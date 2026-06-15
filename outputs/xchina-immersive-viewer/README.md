# Immersive Photo Stream

Local Chrome / Edge extension for immersive masonry-grid viewing on supported gallery pages:

- `xchina.co/photo/*`
- `x.810114.xyz/photo/*`

## Install

### Desktop Edge / Chrome extension

1. Open the browser extension page:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
2. Turn on developer mode.
3. Click "Load unpacked".
4. Select the `xchina-immersive-viewer` folder.

### Android Edge / Tampermonkey userscript

Android Edge cannot load this local unpacked extension folder like desktop Edge. Use the generated Tampermonkey script instead:

1. In Android Edge, open `Extensions` and install `Tampermonkey`.
2. Install `xchina-immersive-viewer.user.js` in Tampermonkey.
3. Open the target gallery page and use the floating `GRID` button.

Build the userscript from the shared content code:

```powershell
node xchina-immersive-viewer/build-userscript.js
```

## Use

1. Open a supported gallery page, for example:
   `https://x.810114.xyz/photo/id-.../1.html`
2. Click the floating `GRID` button at the bottom-right of the page, or click the extension icon.
3. Scroll normally. The viewer opens as a fullscreen masonry grid with many images visible at the same time.

Controls:

- `G`: open or close image stream
- `+`: more columns
- `-`: fewer columns
- `D`: download all collected images as a ZIP
- `Home`: top
- `End`: bottom
- Click image: fullscreen single-image preview
- `Esc`: close preview, then close viewer

The extension does not upload images. It only reads image URLs from the current page and same-gallery pages in your browser.
