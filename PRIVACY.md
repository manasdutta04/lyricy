# Privacy

Lyricy has no account, no server of its own, no analytics and no tracking. Here is everything it touches.

## What it reads in your browser

- **What's playing** in the tab you're listening to: the song title, artist and length, the playback position, and on YouTube the video's title, channel, chapters, description and captions.
- This stays inside the extension. Lyricy doesn't read your history, cookies, passwords or any other page content.

## What it sends, and to whom

To find lyrics, Lyricy sends **only the song title, artist and length** to these public services:

| Service                                                                        | Used for                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------- |
| [iTunes Search API](https://performance-partners.apple.com/search-api) (Apple) | The song's official name, length and artwork |
| [LRCLIB](https://lrclib.net)                                                   | Synced lyrics                                |
| [NetEase Cloud Music](https://music.163.com)                                   | Synced lyrics                                |
| [JioSaavn](https://www.jiosaavn.com)                                           | Lyrics for Indian releases                   |
| [lyrics.ovh](https://lyrics.ovh)                                               | Plain lyrics                                 |

These services see your IP address like any website does, and have their own privacy policies. Nothing else about you is sent.

## YouTube captions

When no lyrics source has a song, Lyricy may switch on YouTube's captions for a moment so the player downloads them, then switch them back off. The captions are read inside your browser and aren't sent anywhere.

## What it stores

On your own device only (`chrome.storage.local`):

- your settings (lyrics language, "Any website"),
- a cache of lyrics it found, so songs load instantly next time.

Removing the extension deletes all of it.

## Permissions

| Permission                         | Why                                                           |
| ---------------------------------- | ------------------------------------------------------------- |
| Access to the listed music sites   | To see what's playing there                                   |
| Access to the lyric services above | To look up lyrics                                             |
| `sidePanel`                        | To show the lyrics next to the page                           |
| `storage`                          | Settings and the lyrics cache                                 |
| `scripting`                        | To run on other sites, only after you turn on **Any website** |
| All websites (optional)            | Only requested if you turn on **Any website** in settings     |

Questions? [Open an issue](https://github.com/manasdutta04/lyricy/issues).
