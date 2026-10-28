ORBIT DEFENDER — ENTROPICMIND
=============================

FILES
- index.html: game layout and interface
- style.css: responsive styling
- game.js: gameplay, enemies, boss, upgrades, score, controls
- manifest.json + icon.svg: PWA install metadata and icon
- sw.js: offline caching

DEPLOY
1. Upload all files to the same root folder of your GitHub repository.
2. Deploy that repository with Cloudflare Pages, or publish the files using your existing static hosting setup.
3. Open the HTTPS URL in Chrome on Android.
4. Use Chrome menu > Add to Home screen / Install app. The browser decides which wording is available.

CONTROLS
- Mobile: hold LEFT / RIGHT buttons to rotate around the core. Weapons fire automatically.
- Desktop: A/D or Left/Right arrows. P or Escape pauses.
- Sound: tap the music icon to enable/disable simple game sound effects.

GAMEPLAY
- Survive the incoming enemies and projectile patterns.
- Collect green salvage for hull repair or rapid fire.
- Boss waves occur every fifth wave.
- Select one upgrade after each completed wave.
- Best score is stored locally in this browser.

NOTES
- Scores are saved in this browser only; they are not synced across devices.
- PWA installation requires HTTPS and browser support. Some browsers may show “Add to Home screen” rather than an Install button.
- Google Fonts are optional and need internet access; the game itself is playable without them.
