# Lyricy — Plan

A Chrome extension (MV3) that shows **Apple-Music-style, time-synced lyrics** on YouTube first, and on other sites with a `<video>`/`<audio>` player second.

Inspiration: _Better Lyrics_ (YouTube Music only). Lyricy targets **regular YouTube** (music videos, lyric videos, live performances, Topic uploads), so the hard part is not the UI. It's **figuring out which song is playing and lining the lyrics up with _this_ video's audio**.

> Licensing note: Better Lyrics is GPL-3.0 and this repo is Apache-2.0, so we write everything from scratch and **don't copy code** from it. We can still learn from how it behaves.

---

## 1. Goals

| #   | Goal             | What "done" means                                                                                             |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| G1  | Correct song     | ≥90% of official music videos and Topic uploads resolve to the right track, with no user action               |
| G2  | Correct timing   | Line timing within ±150 ms; word timing whenever a word-level source exists                                   |
| G3  | Apple Music feel | Word-by-word fill, spring scrolling, depth blur, album-art background, instrumental-break dots, duet layout   |
| G4  | Every language   | CJK, Devanagari, Arabic/Hebrew (RTL), Cyrillic, and more. Optional romanization and translation               |
| G5  | Fast and light   | Lyrics show <800 ms after the video starts (cached: <100 ms). Animation stays at 60 fps with no layout thrash |
| G6  | Runs elsewhere   | Generic adapter for any page with a media element plus MediaSession metadata                                  |

Not goals for v1: karaoke scoring, editing lyrics in the extension, mobile.

---

## 2. Architecture

```
┌──────────────────────── YouTube tab ────────────────────────┐
│ content script (isolated world)                              │
│  ├─ SiteAdapter (youtube | generic)                          │
│  │    • finds <video>, listens for SPA navigation, ad state  │
│  │    • pulls raw metadata                                   │
│  ├─ main-world bridge (injected) → ytInitialPlayerResponse,  │
│  │    "Music in this video" panel, caption tracks            │
│  ├─ SyncClock  (rAF + video.currentTime + playbackRate)      │
│  └─ LyricsView (Shadow DOM, Preact shell + vanilla animator) │
└───────────────▲──────────────────────────────────────────────┘
                │ chrome.runtime messages
┌───────────────┴──── background service worker ──────────────┐
│ TrackResolver → ProviderRegistry → Matcher/Scorer → Aligner  │
│ Cache (IndexedDB: videoId → resolved track + lyrics + offset)│
│ Romanizer / Translator (lazy-loaded, per language)           │
└──────────────────────────────────────────────────────────────┘
                │ (optional, phase 3)
        Cloudflare Worker proxy: shared cache, token handling, rate limits
```

**Stack:** [WXT](https://wxt.dev) (Vite-based MV3 framework; also builds Firefox) · TypeScript · Preact for the panel/settings shell · **a plain DOM + CSS-variables animator** for the per-frame lyric engine (no framework re-renders at 60 fps) · Vitest + Playwright.

### Folder layout

```
src/
  entrypoints/
    background.ts          # service worker
    youtube.content.ts     # YouTube adapter + view mount
    generic.content.ts     # opt-in, any site
    main-world.ts          # reads page JS objects
    popup/ options/        # settings UI
  core/
    resolve/   (title-parser, metadata, musicbrainz/itunes lookup)
    providers/ (lrclib, musixmatch, netease, qq, kugou, genius, yt-captions)
    match/     (scorer, string-sim, duration)
    align/     (offset, asr-align, onset-detect)
    parse/     (lrc, enhanced-lrc, ttml, yrc, qrc, krc → common model)
    lang/      (detect, romanize/*, translate)
    cache/
  view/
    LyricsView.ts  animator.ts  background-mesh.ts  styles.css
```

### Common lyric model

```ts
type Lyrics = {
  source: ProviderId;
  sync: 'word' | 'line' | 'none';
  language: string;
  rtl: boolean;
  lines: Line[];
  offsetMs: number;
};
type Line = {
  start: number;
  end: number; // ms
  words?: Word[]; // word/syllable timing
  agent?: 'v1' | 'v2' | 'group'; // duets → left/right layout
  background?: Line; // "(ooh, yeah)" backing vocals
  romanized?: string;
  translated?: string;
};
type Word = { text: string; start: number; end: number };
```
Every provider format (LRC, Enhanced LRC `<mm:ss.xx>`, Apple-style TTML, NetEase YRC, QQ QRC, Kugou KRC) parses into this one shape.

---

## 3. The hard part: finding and matching the song

### 3.1 Track resolution (YouTube → artist, title, duration)

Use these in order of trust:

1. **"Music in this video" structured data.** Many music uploads carry song, artist, and album in `ytInitialData` (engagement panel). This is the best signal.
2. **Topic channels / Art Tracks** (`"Artist - Topic"`, `musicVideoType: MUSIC_VIDEO_TYPE_ATV`). Metadata is clean and the audio matches the studio master.
3. **Title parsing.** Example: `"Artist - Song (Official Video) [4K] ft. X | Label"`. Strip noise tokens (official, video, audio, lyrics, MV, 4K, HD, remastered, visualizer, live at…). Split on `-`, `–`, `|`, `「」`, `『』`. Pull out `feat.`/`ft.`/`x`. If there's no separator, use the channel name as the artist (drop "VEVO", "Official", "- Topic").
4. **Canonicalize** with the **iTunes Search API** (free, no key, returns duration and artwork) and **MusicBrainz** as fallback. This turns a messy title into `{artist, title, album, durationMs, isrc?, artwork}`.
5. **MediaSession / `og:` tags** for the generic adapter.

Also capture: `videoDuration`, `isLive`, video type (official MV vs lyric video vs live vs cover), and the available caption tracks.

### 3.2 Lyric providers

| Provider            | Sync                | Notes                                                                                                          |
| ------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| **LRCLIB**          | line (some word)    | Free, open, community-run, lookup by artist+title+duration. **Primary.**                                       |
| Musixmatch          | **word (richsync)** | Best coverage and word timing. Unofficial desktop-token API, so it carries ToS risk. Optional, behind a toggle |
| NetEase Cloud Music | **word (YRC)**      | Very strong for Chinese/Japanese/Korean, and has translations                                                  |
| QQ Music / Kugou    | word (QRC/KRC)      | CJK fallback                                                                                                   |
| YouTube captions    | varies              | Official uploads sometimes carry timed lyric captions. Also used for alignment (§3.4)                          |
| Genius              | none                | Plain-text fallback. Also useful for checking line breaks and sections                                         |

The `ProviderRegistry` queries providers **in parallel** with a time budget (~1.5 s). The first acceptable _word-level_ hit wins early. Otherwise it takes the best scorer result when the budget runs out.

### 3.3 Match scoring

For each candidate:

```
score = 0.35·titleSim + 0.25·artistSim + 0.25·durationScore
      + 0.10·syncQuality (word > line > none) + 0.05·providerTrust
```

- `titleSim` / `artistSim`: normalized strings (NFKC, lowercase, strip punctuation and brackets, transliterate for cross-script cases like 米津玄師 ↔ Kenshi Yonezu), then token-set ratio + Jaro-Winkler.
- `durationScore`: 1.0 if |Δ| ≤ 2 s, falling to 0 at 15 s. Measured against the **canonical track** duration, not the video.
- Reject below threshold, then show "No confident match — search?" instead of wrong lyrics. **Wrong lyrics are worse than no lyrics.**
- **User override:** an in-panel search lets the user pick a different result. The choice is saved per `videoId` and wins from then on.

### 3.4 Alignment: making lyrics match _this video's_ audio

Official music videos often have cinematic intros, skits, or extended outros. That shifts every timestamp. Strategy:

1. **Δ = videoDuration − trackDuration.** If |Δ| < 1.5 s, assume no offset.
2. **ASR caption alignment (key feature).** Fetch YouTube's auto-generated captions (timed words). Fuzzy-align them to the lyric lines (DTW over normalized tokens). That gives a global offset and, if needed, **per-section re-timing** for edited cuts. This works on any video with auto-captions.
3. **Vocal onset detection** fallback. `video.captureStream()` → WebAudio analyser → band-energy onset in the 300–3400 Hz range, compared with the first lyric line's start. Coarse, but it handles intros.
4. **Manual nudge:** `[` / `]` keys shift by ±100 ms. Saved per video.
5. Live performances and covers: try a match, but mark the lyrics "unsynced-ish" and fall back to scroll-only mode when alignment confidence is low.

### 3.5 Caching

IndexedDB: `videoId → {track, providerHit, lyrics, offset, userOverride, ts}`. 30-day TTL. User overrides never expire. Also cache negative results for 24 h.

---

## 4. Language support

- **Detect** with Chrome's built-in **Language Detector API** (on-device), falling back to a Unicode-script heuristic.
- **Romanization** (toggle, lazy-loaded per language):
  Japanese → kuroshiro + kuromoji · Korean → Revised Romanization (rule-based) · Chinese → pinyin-pro · Hindi/Devanagari, Bengali, etc. → sanscript-style transliteration · Cyrillic/Greek → table-based.
- **Translation** (toggle): Chrome's built-in **Translator API** (on-device, free, private) first. Use provider-supplied translations when present (NetEase/Musixmatch).
- **Display:** romanization or translation in a smaller line under each lyric line. Correct `lang` attribute on every line (picks the right CJK glyphs). `dir="rtl"` handled for Arabic/Hebrew/Urdu, including word-fill direction.
- **Fonts:** system stack first (`-apple-system, "SF Pro Display", Inter, "Noto Sans", "Noto Sans JP/KR/SC", …`). Optionally ship Inter Variable.

---

## 5. UI — the Apple Music feel

### 5.1 Placements on YouTube

1. **Side panel** (default): replaces or tabs alongside the recommendations column in the watch page sidebar, height-matched to the player.
2. **Theater / fullscreen overlay:** lyrics over a darkened, blurred frame of the video.
3. **Immersive mode** (hotkey `L`): full-window, Apple-Music-style layout with album art and title on the left, lyrics on the right, and an animated background.

All three are rendered inside a **Shadow DOM** root so YouTube's CSS can't leak in.

### 5.2 Visual and motion spec

- **Typography:** big, bold (≈ 28–40 px, weight 700–800), tight leading, left-aligned. Duet second voice is right-aligned.
- **Line states:** active line at 100% opacity. Others at ~35%, with **blur growing with distance** (`filter: blur(n·0.6px)`, capped). Past lines dim a little further.
- **Word fill:** each word is a span whose `background: linear-gradient(90deg, #fff var(--p), rgba(255,255,255,.35) var(--p))` uses `background-clip: text`. The animator writes `--p` (0→100%) per frame for the active word only. For line-only sync, the whole line fills over its duration (or snaps, per setting).
- **Sustained notes:** words longer than ~1 s get a subtle **lift** (`translateY(-2px)`), a soft **glow** (`text-shadow`), and per-letter fill for that word.
- **Scrolling:** the active line is held ~30% from the top. The move to the next line uses a **spring** (critically-damped, ~450 ms), with each following line delayed by ~25 ms so the list ripples instead of sliding as one block. `transform` only, never `top`/`scrollTop`, to avoid layout cost.
- **Instrumental breaks** (gap > 4 s): three dots that breathe and fill in step with the gap's progress.
- **Background vocals:** smaller, italic-free, lower-opacity line attached under the main line, filling on its own timing.
- **Background:** album art (or the video thumbnail) → several heavily blurred, saturated copies drifting slowly (mesh-gradient look) on a canvas/CSS layer. Pauses when the tab is hidden.
- **Interaction:** click a line to seek. Manual scroll pauses auto-follow for 3 s, then it glides back. Hover a line to see its timestamp.
- **Accessibility:** `prefers-reduced-motion` turns off blur, springs, and the moving background (falls back to simple fades). Line text stays real DOM text, so it's selectable and readable by screen readers.

### 5.3 Performance rules

- One `requestAnimationFrame` loop. Index lookup by binary search over line starts. Only the active and adjacent lines get touched each frame.
- `will-change: transform` only on the scrolling container. Blur values are pre-set per distance class (CSS classes), not recomputed every frame.
- `SyncClock` interpolates between `currentTime` updates using `performance.now()` × `playbackRate`. It re-anchors on `seeked`, `ratechange`, `play`, and `pause`.
- Detects ads (`.ad-showing` on the player) and freezes lyrics while an ad plays.

### 5.4 Popup / options

On/off per site · placement · font size · romanization/translation toggles and target language · provider toggles (unofficial sources off by default) · sync offset · theme (album-art / dark / custom) · keyboard shortcuts · clear cache.

---

## 6. YouTube integration details

- SPA navigation: listen for `yt-navigate-finish` and `yt-page-data-updated`. Tear down and re-resolve on each `videoId` change.
- Main-world script reads `ytInitialPlayerResponse` / `ytInitialData` (or the player's `getPlayerResponse()`). It posts only the needed fields back via `window.postMessage` with a nonce.
- Skip non-music videos cheaply: category `Music` (id 10), Topic channel, "Music in this video" present, or a title that parses confidently. Otherwise show a small "Find lyrics" button instead of running automatically.
- Also works on Shorts (compact overlay) and embedded players (generic adapter).

---

## 7. Milestones

| Phase                      | Scope                                                                                                                                                               | Exit criteria                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **0. Scaffold** (½ day)    | WXT + TS + Preact, lint/test setup, manifest, YouTube content script mounts an empty Shadow-DOM panel                                                               | Panel appears on watch pages and survives SPA navigation                     |
| **1. MVP**                 | Title parser, iTunes canonicalization, **LRCLIB**, LRC parser, scorer, SyncClock, side-panel view with line highlighting + spring scroll + click-to-seek, cache     | Correct, line-synced lyrics on a 50-video test set of official uploads       |
| **2. Apple feel**          | Word-fill animator, Enhanced LRC/TTML parsing, distance blur, album-art mesh background, instrumental dots, duets/background vocals, immersive mode, reduced-motion | Side-by-side with Apple Music looks and feels equivalent at 60 fps           |
| **3. Accuracy**            | More providers (NetEase, optional Musixmatch, QQ/Kugou, YT captions), parallel race, **ASR alignment + offset**, manual search/override, manual nudge               | ≥90% correct match and ≤150 ms timing on a 200-video multilingual test set   |
| **4. Languages**           | Detection, romanization packs, on-device translation, RTL, fonts                                                                                                    | JP/KR/ZH/HI/AR test songs render correctly with romanization and translation |
| **5. Everywhere + polish** | Generic adapter (MediaSession), theater/fullscreen overlay, Shorts, options page, Firefox build, optional Cloudflare Worker cache                                   | Chrome Web Store–ready build                                                 |

A **golden test set** (videoId → expected track + reference offset) runs in CI against the resolver and matcher. That's how we measure G1/G2 instead of guessing.

---

## 8. Risks

- **Lyrics copyright / provider ToS.** LRCLIB is community-run and the safe default. Musixmatch/NetEase/QQ endpoints are unofficial and can break or get blocked. Keep them optional, isolated behind the provider interface, and never bundle lyrics in the extension.
- **YouTube DOM churn.** Rely on player JSON first, and keep selectors in one file.
- **Chrome Web Store review.** Use narrow host permissions (YouTube plus provider domains). Generic mode uses `activeTab` / optional permissions.
- **Alignment on edited MVs.** ASR alignment handles most of it. Low confidence → scroll-only mode rather than confidently wrong timing.

---

## 9. Open decisions

1. **Unofficial word-level sources** (Musixmatch/NetEase): include them behind an off-by-default toggle, or LRCLIB-only?
2. **Backend:** stay fully client-side, or add a small Cloudflare Worker for shared caching and token handling (phase 5)?
3. **Browsers:** Chrome only, or Chrome + Firefox + Edge from the start (WXT makes this cheap)?
4. **Name / branding:** keep "Lyricy"?

---

## 10. Status (2026-11-12) and next session

### Done so far

- **Architecture changed to a side panel.** Lyrics live in Chrome's side panel. Two page scripts report playback (`page-hooks` in the page world, `agent` in the isolated world) and never draw on the site. This replaced the in-page sidebar, fullscreen overlay, Shorts card and YouTube Music tab injection, which caused crashes and broken page UI.
- **Sites:** YouTube (+ Shorts), YouTube Music, Spotify, SoundCloud, Apple Music, Deezer, Tidal, Amazon Music, JioSaavn, Gaana, Wynk, Pandora, Bandcamp, Audiomack, plus "every other website" via an optional permission.
- **Lyrics sources:** LRCLIB + NetEase (synced), the video's own captions, lyrics.ovh (plain text). iTunes is used for the canonical track.
- **Timing:** auto-sync of plain lyrics and music-video intro offsets, both from YouTube auto-captions. Manual ± nudge.
- **Language:** English letters by default (Hinglish via a custom transliterator, Hinglish/romaji uploads preferred when they exist).
- Tests: 117 unit tests plus a 17-song live check against the real services.

### Next session (2026-11-13)

**A. Fix "No lyrics found" for big songs.** Reproduced with _Ramayana: Mangal Rang (Song) | Namit M, Nitesh T | AR Rahman, Arijit Singh, Shreya Ghoshal, Kumar V_ (T-Series, 2:26 edit of a 4:37 song). It barely matches today (0.66 via NetEase; LRCLIB has it but isn't reached).

1. Title parser: treat `Film: Song` as film + song (search "Mangal Rang"), add `(Song)`, `(Full Song)`, `(From "…")` to noise, and split credit segments like "AR Rahman, Arijit Singh" into separate artist guesses.
2. "Music in this video" reader: only read cards inside the **Music** section. Today it picks up YouTube's _people_ card ("A. R. Ameen · Indian playback singer"). Never show an untrusted card in the header.
3. Duration: when the video is clearly an edit/teaser (shorter than the track), stop penalizing length. Use caption alignment for the offset instead.
4. Search breadth: also query LRCLIB/NetEase with each credited singer + song, and with the iTunes canonical even if its score is 0.6–0.72 (use it for search, not as truth).
5. Grow the live test set to ~60 Bollywood/Punjabi/T-Series/Sony uploads and track the hit rate. Target ≥95% on major releases.

**B. Settings in a pop-up, not a full page.**

- The ⚙ button opens a small popover/dialog over the panel (script mode, all-sites switch). Close on outside click or Esc.

**C. Minimal side panel.**

- Smaller header: small artwork, one-line title, dimmed artist. No big blurred backdrop, or a very subtle one.
- Lyrics are the focus: a slightly smaller font in narrow panels, less padding.
- Footer reduced to a tiny source label. Show the timing nudge only on hover.
- Quieter empty / not-found states (one line + retry icon), plus a manual "search with another title" field for misses.

**D. Then:** word-by-word fill (Phase 2 animator) and a check that Spotify/JioSaavn timing works.
