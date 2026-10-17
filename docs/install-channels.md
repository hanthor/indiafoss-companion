# Installing the Android apps and keeping them current

The Companion and IndiaFOSS Chat have signed APKs on their GitHub release
pages. The Companion also has a reviewed Preview build in our F-Droid
repository; Chat is not published there yet. For Companion, direct downloads,
Obtainium, and compatible F-Droid clients use the same signing key.

## Obtainium

[Obtainium](https://github.com/ImranR98/Obtainium) watches a release page and
installs new builds as they appear.

1. Install Obtainium from its
   [latest release](https://github.com/ImranR98/Obtainium/releases/latest)
   (or from F-Droid or IzzyOnDroid, where it is also listed).
2. Add the app. Tap the **Obtainium** link on the Companion's Home or Settings
   page, or paste the repository URL into Obtainium's _Add App_ screen:
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

The live [IndiaFOSS Preview repository](https://hanthor.github.io/indiafoss-android-repo/fdroid/repo)
publishes reviewed Companion APKs under a separately signed index. Chat is not
published there yet. This is a preview channel, not the official
f-droid.org catalogue.

Add it to F-Droid, Neo Store, or Droid-ify with the PWA's **Add to F-Droid /
Neo Store** link or QR code. The direct link is:

`fdroidrepos://hanthor.github.io/indiafoss-android-repo/fdroid/repo?fingerprint=AD932C530715E9CAA39415F94E007002FB3DA0DD2583FF92DFC7F6DFE46CCCC2`

You can also add `https://hanthor.github.io/indiafoss-android-repo/fdroid/repo`
by hand and verify fingerprint
`AD932C530715E9CAA39415F94E007002FB3DA0DD2583FF92DFC7F6DFE46CCCC2`. The PWA
Home and Settings download card carries the same link, fingerprint, and QR code.

## Direct download

The **Download Android APK** button on the PWA and the
[`nightly`](https://github.com/hanthor/indiafoss-companion/releases/tag/nightly)
release page remain available; the release page carries the SHA-256 for each
file. A hand-installed APK does not update itself. Use Obtainium or a compatible
F-Droid client for updates.

## What we do not use

We do not publish to the official f-droid.org catalogue or direct attendees to
unrelated third-party app stores. Supported distribution paths are the release
page, Obtainium, the IndiaFOSS Preview repository, and direct APK installation.
