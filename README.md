# PictBake

PictBake is a dependency-free Chrome Extension Manifest V3 project for converting images locally in Chrome. Its main workflow is right-click conversion from webpages, especially saving WebP images as PNG or JPEG.

## Features

- Right-click an image and choose `PictBake -> Save image as PNG` or `PictBake -> Save image as JPEG`.
- Converts with browser-native APIs: `fetch`, `createImageBitmap`, `canvas`, and `canvas.toBlob`.
- Uses an MV3 offscreen document for canvas work because service workers do not have DOM or canvas access.
- Saves converted files with `chrome.downloads`.
- Requests optional host permission only when a right-click conversion needs to fetch an `http` or `https` image.
- Includes a local manual converter page for files already on your computer.
- Stores simple options for JPEG quality, JPEG background color, save prompt behavior, default format, and output folder prefix.

## Privacy and Offline Guarantee

PictBake has no analytics, telemetry, tracking, CDN, remote script, external library, package manager, server, or build step. Conversion happens inside Chrome on your machine.

The only network request PictBake makes is fetching the exact image URL you selected from a webpage for right-click conversion. Local file conversion does not upload anything.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder.

The included PNG icons are simple generated placeholders so the extension loads without manifest errors.

## Use

### Right-click conversion

1. Right-click an image on a webpage.
2. Choose `PictBake`.
3. Choose `Save image as PNG` or `Save image as JPEG`.
4. If Chrome asks for site permission, approve it for that image host.
5. The converted file downloads locally.

JPEG output uses the configured quality and background color. The background color matters for transparent images because JPEG does not support transparency.

### Local converter page

1. Click the PictBake toolbar icon.
2. Click `Open Converter`.
3. Drop an image or choose a file, such as a `.webp` file.
4. Pick PNG or JPEG.
5. Convert and download.

## Options

Open the options page from the popup or Chrome extension details. Available settings:

- Default format for the local converter.
- JPEG quality from `0.60` to `1.00`.
- JPEG background color, default `#ffffff`.
- Ask where to save each file.
- Output folder prefix, default `PictBake`.

## Known Limitations

- Animated WebP exports as a still frame. Chrome normally decodes the default or first frame through `createImageBitmap`.
- Some protected, authenticated, hotlink-blocked, lazy-loaded, or dynamically generated images may fail.
- Page-owned `blob:` URLs usually cannot be fetched reliably from an extension service worker. PictBake reports a clear error for those cases. Use the local converter if you can save the original file first.
- `data:` image URLs are supported when Chrome can decode them, but very large data URLs may be memory-heavy.
- Metadata such as EXIF, ICC profiles, comments, and original file timestamps are not preserved by canvas export.
- Very large images can require a lot of memory and may fail during decode, canvas allocation, or encoding.
- AVIF, GIF, JPEG, PNG, and other formats can be converted if the installed Chrome version can decode them with `createImageBitmap`.

## Architecture

- `background.js`: MV3 service worker. It creates context menus, requests optional host permissions, fetches the selected image, coordinates conversion, handles errors, and starts downloads.
- `offscreen.html` and `offscreen.js`: hidden extension document used for canvas conversion. The service worker sends source bytes, target format, JPEG quality, and background color. The offscreen document returns a data URL for download.
- `converter.html`, `converter.js`, and `converter.css`: manual local file converter. It uses the same browser-native conversion approach directly in a visible page.
- `options.html`, `options.js`, and `options.css`: stores user preferences in `chrome.storage.sync`.
- `popup.html`, `popup.js`, and `popup.css`: toolbar popup with shortcuts and a settings summary.
- `shared.js`: common defaults and utility helpers for options, filenames, data URLs, byte formatting, and validation.

## Future Improvements

- Batch conversion in the local converter.
- Copy converted image to clipboard.
- More advanced filename collision handling.
- Optional `save as default format` context-menu action.
- Broader AVIF-to-PNG/JPEG messaging where browser decoding supports it.

## Development Notes

This project intentionally has no `npm install`, no build command, and no generated bundle. Edit the files directly and reload the unpacked extension in Chrome.
