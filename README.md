<p align="center">
  <img src="assets/logo.svg" width="112" height="112" alt="Lyricy logo" />
</p>

<h1 align="center">Lyricy</h1>

<p align="center">
  Apple Music-style, time-synced lyrics in your browser's side panel,<br />
  for YouTube, YouTube Music, Spotify and more.
</p>

<p align="center">
  <a href="https://github.com/manasdutta04/lyricy/actions/workflows/ci.yml"><img src="https://github.com/manasdutta04/lyricy/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://github.com/manasdutta04/lyricy/releases/latest"><img src="https://img.shields.io/github/v/release/manasdutta04/lyricy?include_prereleases&label=download" alt="Latest release" /></a>
</p>

<p align="center">
  <a href="INSTALL.md"><b>Install</b></a> ·
  <a href="#features">Features</a> ·
  <a href="CONTRIBUTING.md">Contribute</a> ·
  <a href="PRIVACY.md">Privacy</a>
</p>

---

Lyricy is a free, open-source browser extension. Play a song, click the icon, and the lyrics appear in the side panel, highlighted word by word as they're sung. It never draws on top of the website, so the player works exactly as before.

## Install

Lyricy isn't on the Chrome Web Store; you load it yourself in a couple of minutes. **[Follow the installation guide →](INSTALL.md)**

Short version: download the zip from [Releases](https://github.com/manasdutta04/lyricy/releases/latest) (or `npm install && npm run build`), open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the folder.

Works in Chrome, Edge, Brave, Arc, Opera and Vivaldi.

## Features

- **Synced lyrics, word by word.** Apple Music-style highlighting, soft blur on distant lines, and breathing dots during instrumental breaks.
- **Matches the exact video.** Music videos with long intros, live cuts and remixes are re-timed against the video, not the album track.
- **Jukeboxes and medleys.** Each song in a multi-song video gets its own lyrics, using the video's chapters.
- **Your language, in English letters.** Hindi, Bengali, Punjabi, Gujarati, Japanese, Korean, Chinese and more are shown as Hinglish, "Bengalish", romaji and so on, with the original script underneath (or either one alone).
- **Finds hard-to-find songs.** When no lyrics site has a song, Lyricy uses lyrics the uploader pasted in the description or the video's captions, synced to the singing. **Find it anyway** runs a deeper search.
- **Follows the music.** Keeps up in theater mode, fullscreen (floating window), the YouTube mini player, Shorts, and when the song plays in another tab.
- **No account, no tracking, no paid services.** See [PRIVACY.md](PRIVACY.md).

## Works on

YouTube · YouTube Music · Spotify · SoundCloud · Apple Music · Deezer · Tidal · Amazon Music · JioSaavn · Gaana · Wynk · Pandora · Bandcamp · Audiomack

Any other site that reports what's playing works too after you turn on **Any website** in Lyricy's settings.

## How it finds lyrics

1. **What's playing:** the YouTube player (title, channel, "Music in this video" card, chapters, captions), or the page's MediaSession metadata on other sites.
2. **Which song:** title parsing plus iTunes Search for the canonical artist, title, length and artwork.
3. **Lyrics (best match wins):** LRCLIB and NetEase Cloud Music (synced), then the uploader's captions, lyrics in the video description, YouTube's auto-captions, JioSaavn and lyrics.ovh (plain).
4. **Timing:** plain lyrics are synced, and studio timings re-aligned, using YouTube's auto-captions for this exact video.
5. **Language:** non-Latin lyrics are transliterated into English letters, with the original kept alongside.

## Develop

Requires Node 22+.

```bash
npm install
npm run dev          # opens Chrome with the extension loaded and hot reload
```

| Script                    | What it does                                |
| ------------------------- | ------------------------------------------- |
| `npm run build`           | Production build into `.output/chrome-mv3`  |
| `npm run zip`             | Zip for sharing or a GitHub release         |
| `npm run compile`         | Type-check                                  |
| `npm test`                | Unit tests (Vitest)                         |
| `npm run lint` / `format` | Biome lint + format                         |
| `npm run icons`           | Re-render the icons from `assets/logo.svg`  |

Real-network check against the lyric services: `LIVE=1 npx vitest run src/core/pipeline.live.test.ts`

### Layout

```
src/
  entrypoints/
    sidepanel/               the lyrics UI (side panel)
    agent.content.ts         per-tab agent: streams playback to the panel (no page UI)
    page-hooks.content.ts    page-world hooks: media elements, MediaSession, YouTube player
    background.ts            lyrics pipeline + cache, side-panel + all-sites setup
  core/
    pipeline.ts              song matching, provider ranking, timing, romanization
    providers/               LRCLIB, NetEase, JioSaavn, lyrics.ovh
    lyrics/                  LRC parsing, caption alignment, word timing
    lang/                    script detection and transliteration (Hinglish, Bengali, Korean…)
    match/, resolve/         similarity scoring, title parsing, iTunes lookup
    youtube/                 chapters and description lyrics
  ui/                        lyrics view, panel card, agent + lyrics hooks
```

## Contributing

Bug reports, wrong-lyrics reports and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: see [SECURITY.md](SECURITY.md).

## Credits

Lyrics come from the community-run [LRCLIB](https://lrclib.net), [NetEase Cloud Music](https://music.163.com), [JioSaavn](https://www.jiosaavn.com) and [lyrics.ovh](https://lyrics.ovh); song details from the [iTunes Search API](https://performance-partners.apple.com/search-api). Lyrics belong to their respective owners. Lyricy only displays them (with a cache on your own device) and never redistributes them.

## License

[Apache-2.0](LICENSE) © Manas Dutta
