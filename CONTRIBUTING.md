# Contributing to Lyricy

Thanks for helping make Lyricy better! All kinds of help are welcome: wrong-lyrics reports, bug reports, transliteration fixes for your language, code and docs.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting problems

Use the [issue forms](https://github.com/manasdutta04/lyricy/issues/new/choose):

- **Wrong or missing lyrics:** the video link, the time where it goes wrong, and what you expected. This is the most useful report: each one usually becomes a test case.
- **Bug:** what you did, what happened, and your browser and version.
- **Feature idea:** the problem it solves for you.

Please search existing issues first. For security problems, don't open an issue; see [SECURITY.md](SECURITY.md).

## Setting up

Requires [Node.js](https://nodejs.org) 22+ and Git.

```bash
git clone https://github.com/<you>/lyricy.git
cd lyricy
npm install
npm run dev
```

`npm run dev` opens a separate Chrome profile with the extension loaded and reloads it as you edit. To try a production build in your own browser, run `npm run build` and load `.output/chrome-mv3` as described in [INSTALL.md](INSTALL.md).

## Before you open a pull request

Run all four checks; CI runs the same ones:

```bash
npm run compile   # TypeScript
npm run lint      # Biome (npm run format fixes most issues)
npm test          # Vitest unit tests
npm run build     # the extension still builds
```

Then:

- **Add a test** for the behaviour you changed. Matching and language fixes belong in the existing tests (`src/core/**/*.test.ts`); a real video that now works makes a good case.
- **Keep the pull request focused** on one change, and describe what it fixes and how you checked it. Screenshots help for UI changes.
- **Try it in the browser** for anything that touches playback, the side panel or YouTube.

The live tests call the real lyric services and are skipped by default. Run them when you change matching or providers:

```bash
LIVE=1 npx vitest run src/core/pipeline.live.test.ts
```

## Where things live

| Area                                          | Files                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Lyrics UI and animation                       | `src/ui/LyricsView.tsx`, `src/ui/lyrics.css`                                |
| Side panel shell and settings                 | `src/entrypoints/sidepanel/`                                                |
| What's playing (YouTube player, MediaSession) | `src/entrypoints/page-hooks.content.ts`, `src/entrypoints/agent.content.ts` |
| Song matching and source ranking              | `src/core/pipeline.ts`, `src/core/match/`, `src/core/resolve/`              |
| Lyrics sources                                | `src/core/providers/`                                                       |
| Syncing to the video                          | `src/core/lyrics/align.ts`, `src/core/agent/captions.ts`                    |
| Transliteration (Hinglish, Bengali…)          | `src/core/lang/`                                                            |

## Guidelines

- **Wrong lyrics are worse than no lyrics.** Matching changes should not make false matches more likely; add a test for the false match you're guarding against.
- **Stay free and private.** No paid APIs, accounts, analytics or tracking. Only song title, artist and length may be sent to lyric services. Add new hosts to `wxt.config.ts` and list them in [PRIVACY.md](PRIVACY.md).
- **Don't draw on the page.** Lyricy's UI lives in the side panel and floating window, never inside the website.
- **Respect the services.** Use public endpoints as they're meant to be used. Don't work around bot checks, rate limits or sign-in.
- **Style:** Biome formats the code; prefer small functions with a short comment explaining _why_.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org): `feat: …`, `fix(captions): …`, `docs: …`, `test: …`, `chore: …`.

## Releases (maintainers)

1. Bump `version` in `package.json` (`npm version 0.2.0 --no-git-tag-version`) and add the changes to [CHANGELOG.md](CHANGELOG.md).
2. Commit, then push a tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. The release workflow builds the zip and publishes a GitHub release with it.

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
