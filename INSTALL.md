# Installing Lyricy

Lyricy isn't on the Chrome Web Store. You install it yourself as an "unpacked" extension, which takes about two minutes. It works in any Chromium browser that has a side panel: **Chrome, Edge, Brave, Arc, Opera and Vivaldi**. Firefox and Safari are not supported.

There are two ways to get it:

- [Option A: download a ready-made build](#option-a-download-a-ready-made-build) (easiest, no tools needed)
- [Option B: build it from the source code](#option-b-build-from-source) (always the latest code)

---

## Option A: download a ready-made build

1. Open the [Releases page](https://github.com/manasdutta04/lyricy/releases/latest).
2. Under **Assets**, download `lyricy-<version>-chrome.zip`.
3. **Unzip it** into a folder you'll keep, for example `Documents/Lyricy`. Don't delete or move this folder later: the browser loads the extension from it.
4. Continue with [Load it into your browser](#load-it-into-your-browser) below.

> No release yet? Use Option B, or download the latest automatic build: open the [Actions tab](https://github.com/manasdutta04/lyricy/actions/workflows/ci.yml), click the most recent green run, and download the `lyricy-chrome` artifact at the bottom (you need to be signed in to GitHub).

## Option B: build from source

You need [Node.js](https://nodejs.org) 22 or newer and [Git](https://git-scm.com).

```bash
git clone https://github.com/manasdutta04/lyricy.git
cd lyricy
npm install
npm run build
```

The extension is now in the `.output/chrome-mv3` folder. Continue below.

## Load it into your browser

1. Open the extensions page:

   | Browser      | Address                |
   | ------------ | ---------------------- |
   | Chrome / Arc | `chrome://extensions`  |
   | Edge         | `edge://extensions`    |
   | Brave        | `brave://extensions`   |
   | Opera        | `opera://extensions`   |
   | Vivaldi      | `vivaldi://extensions` |

2. Turn on **Developer mode** (a switch in the top-right corner; in Edge it's in the left sidebar).
3. Click **Load unpacked**.
4. Pick the folder that contains `manifest.json`:
   - Option A: the folder you unzipped.
   - Option B: `lyricy/.output/chrome-mv3`.
5. Lyricy appears in the list. Click the puzzle-piece icon in the toolbar and **pin** Lyricy so its icon stays visible.

## Use it

1. Play a song on YouTube, YouTube Music, Spotify, or another [supported site](README.md#works-on).
2. Click the Lyricy icon. The lyrics open in the side panel and follow the music.
3. Optional:
   - **⧉** opens the lyrics in a small floating window that stays on top, even over a fullscreen video.
   - **⚙** chooses the lyrics language (English letters, original script, or both) and turns on **Any website** for sites that aren't on the list.

If a song shows "No lyrics found", click **Find it anyway** for a deeper search.

## Updating

- **Option A:** download the newer zip, unzip it over the old folder (replace the files), then click the **↻ reload** button on Lyricy's card in the extensions page.
- **Option B:** in the `lyricy` folder run `git pull`, `npm install` and `npm run build`, then click **↻ reload** on Lyricy's card.

Your settings are kept across updates.

## Uninstalling

Open the extensions page and click **Remove** on Lyricy's card. You can then delete the folder.

## Troubleshooting

| Problem                                                       | Fix                                                                                                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Manifest file is missing or unreadable"                      | You picked the wrong folder. Choose the one that directly contains `manifest.json`.                                                                                    |
| The side panel says nothing is playing                        | Reload the music tab once after installing (tabs opened before the install don't have Lyricy yet).                                                                     |
| The browser warns about developer-mode extensions on start-up | That's normal for extensions installed this way. Click **Keep** or close the warning.                                                                                  |
| Lyrics are a little early or late                             | Seek once in the video; Lyricy re-reads the position. If one song stays off, [report it](https://github.com/manasdutta04/lyricy/issues/new?template=wrong_lyrics.yml). |
| A site that isn't listed shows nothing                        | Open ⚙ and turn on **Any website**, then reload that tab.                                                                                                              |
| The extension disappeared after moving its folder             | Load it again from the new location (step 3 above).                                                                                                                    |

Still stuck? [Open an issue](https://github.com/manasdutta04/lyricy/issues/new/choose).
