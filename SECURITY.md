# Security Policy

## Supported versions

Only the latest release and the `main` branch get security fixes.

## Reporting a vulnerability

Please **don't open a public issue** for security problems.

Report them privately through GitHub instead: open the repository's [Security tab](https://github.com/manasdutta04/lyricy/security) and click **Report a vulnerability**. Include:

- what the problem is and what an attacker could do with it,
- steps to reproduce (a page or video that triggers it helps),
- the Lyricy version or commit, and your browser.

You'll get a reply within a week. Once a fix is released, you'll be credited in the release notes unless you'd rather not be.

## What's in scope

Lyricy runs on music sites and talks to public lyric services, so we're especially interested in:

- a website being able to read Lyricy's data, change what it shows in a harmful way, or run code in the extension,
- data leaving the browser beyond what [PRIVACY.md](PRIVACY.md) describes,
- the extension asking for or using more permissions than it needs.

Wrong or missing lyrics are not security issues; please use the normal [issue forms](https://github.com/manasdutta04/lyricy/issues/new/choose) for those.
