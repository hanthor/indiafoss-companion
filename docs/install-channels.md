# Installing the Android apps and keeping them current

The Companion and IndiaFOSS Chat are distributed as signed APKs from their
GitHub release pages. There are two ways to keep them updated, and both install
exactly the same file the direct download link serves, signed with the same key:

## Obtainium

[Obtainium](https://github.com/ImranR98/Obtainium) watches a release page and
installs new builds as they appear.

1. Install Obtainium from its
   [latest release](https://github.com/ImranR98/Obtainium/releases/latest)
   (or from F-Droid or IzzyOnDroid, where it is also listed).
2. Add the app. Either tap the **Obtainium** link on the Companion's Connect or
   Settings page, or paste the repository URL into Obtainium's _Add App_ screen:
   - Companion: `https://github.com/hanthor/indiafoss-companion`
   - Chat: `https://github.com/hanthor/indiafoss-chat-android`
3. Obtainium picks the `nightly` pre-release's APK. Enable _Include
   prereleases_ if it does not, and pin the APK filename under the app's
   settings so the checksum sidecar is never chosen:
   - Companion: `indiafoss-companion-nightly.apk`
   - Chat: `indiafoss-chat-android-arm64-v8a.apk` on an arm64 phone, which is
     almost every phone and much the smaller download. Pin
     `indiafoss-chat-android.apk` instead if that one will not install; it
     carries every architecture. Chat publishes both, so an unpinned filename
     is ambiguous here.
4. Updates then arrive on Obtainium's own schedule; it asks before installing.

If you first installed the APK by hand, Obtainium can still update it, because
the signing key is the same ([release.md](./release.md) describes that
identity and how it is verified in CI).

## Our F-Droid repository

A maintainer-run F-Droid repository for reviewed Companion and Chat builds is
being set up in [hanthor/indiafoss-android-repo](https://github.com/hanthor/indiafoss-android-repo)
(tracking issues [#291](https://github.com/hanthor/indiafoss-companion/issues/291)
and [#364](https://github.com/hanthor/indiafoss-companion/issues/364)). It will
serve the same signed APKs under a separately signed index. Until that endpoint
is live the PWA does not show an _Add repository_ link; when it is, the link,
its fingerprint and a QR code will appear next to the download buttons.

## Direct download

The **Download Android APK** button on the PWA and the
[`nightly`](https://github.com/hanthor/indiafoss-companion/releases/tag/nightly)
release page remain available; the release page carries the SHA-256 for each
file. A hand-installed APK does not update itself, which is why the two
channels above exist.

## What we do not use

We do not publish to, or direct attendees towards, third-party app stores. The
update path is the release page (via Obtainium) and our own F-Droid
repository.
