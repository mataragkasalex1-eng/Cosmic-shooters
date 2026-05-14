Version: v0.4.2.5

Contents
- index.html — main menu and canvas
- script.js — module loader for main.js
- main.js — full game logic (ES module)
- style.css — UI and layout styles
- assets/ & .png/.mp3 files — game art and audio
- package.json — convenience script for serving locally
- licsne.md — license text (GNU AGPLv3)

## Requirements
- A modern browser supporting ES modules.
- Node.js (optional) to use the included static server for local testing.

## Running locally
1. Install a static server (optional):
   - npm i -g serve
2. From the project root run:
   - npm run start
   This will serve the project at http://localhost:8080 by default (see package.json scripts).

You may also open index.html directly in a browser for quick testing, but note that some features (audio fetch, local file security) may behave differently when not served over HTTP(S).(not reccomended)
The project already uses local assets; do not inline large audio files as base64.
- If moving assets to a CDN, update paths in index.html and main.js accordingly and validate CORS. Keep filenames identic
- This project is released under the GNU Affero General Public License v3.0 (AGPLv3). The full license text is included in licsne.md. By distributing or deploying a modified server-side version, you must make source code available under the same license.
- If audio doesn't play: browser autoplay rules may block playback until a user gesture. Try clicking Start.
- If saved purchases or unlocked items are missing after upload: ensure browser localStorage isn't cleared and that APP_VERSION migration logic in main.js hasn't changed version keys unexpectedly.
- If images fail to render: make sure all image files are uploaded and paths unchanged.
