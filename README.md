# Lyricy

Apple Music-style, time-synced lyrics in Chrome's **side panel**, for YouTube, YouTube Music, Spotify, SoundCloud, Apple Music, JioSaavn and more. Browser extension (Manifest V3) built with [WXT](https://wxt.dev), TypeScript and Preact.

Lyricy never draws on top of the website. A small agent in the tab reports what's playing, and the lyrics live in the side panel. See [PLAN.md](PLAN.md) for the roadmap.

## How it finds lyrics

1. **What's playing:** the YouTube player (title, channel, "Music in this video" card, captions) or the page's MediaSession metadata on other sites.
2. **Which song:** title parsing + iTunes Search to get the canonical artist, title, length and artwork.
3. **Lyrics sources (best match wins):** LRCLIB and NetEase Cloud Music (synced), then the video's own captions, then lyrics.ovh (plain text).
4. **Timing:** plain lyrics are auto-synced, and studio timings are shifted to match music-video intros. Both use YouTube's auto-captions. The side panel also has a manual ± nudge.
5. **Language:** non-Latin lyrics are shown in English letters by default (Hinglish, romaji, romanized Korean…), with a setting for original/both.

## Develop

Requires Node 22+.

```bash
npm install
npm run dev          # opens Chrome with the extension loaded and hot reload
```

To load it manually: `npm run build`, then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `.output/chrome-mv3`. Click the Lyricy toolbar icon to open the side panel.

## Scripts

| Script                            | What it does                     |
| --------------------------------- | -------------------------------- |
| `npm run build` / `build:firefox` | Production build into `.output/` |
| `npm run zip`                     | Store-ready zip                  |
| `npm run compile`                 | Type-check                       |
| `npm test`                        | Unit tests (Vitest)              |
| `npm run lint` / `format`         | Biome lint + format              |

Real-network check against the lyric services: `LIVE=1 npx vitest run src/core/pipeline.live.test.ts`

## Layout

```
src/
  entrypoints/
    sidepanel/               the lyrics UI (Chrome side panel)
    agent.content.ts         per-tab agent: streams playback to the panel (no page UI)
    page-hooks.content.ts    page-world hooks: media elements, MediaSession, YouTube player
    background.ts            lyrics pipeline + cache, side-panel + all-sites setup
  core/
    pipeline.ts              song matching + provider ranking + timing + romanization
    providers/               LRCLIB, NetEase, lyrics.ovh
    lyrics/                  LRC parsing, caption alignment (auto-sync / offset), twins
    lang/                    script detection, Hinglish/Korean/other transliteration
    match/, resolve/         similarity scoring, title parsing, iTunes lookup
  ui/                        lyrics view, panel card, agent + lyrics hooks
```

## License

Apache-2.0
