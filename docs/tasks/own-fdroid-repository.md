# Our Android update repository

Status: implementation plan, 9 September 2026. No repository index or add-repository link is published yet.

## Attendee experience

The PWA offers Download APK and Add our F-Droid repository. One subscription lists Companion and Chat. The client checks for updates; installation confirmation and automatic-update behaviour depend on the client and Android permissions. Direct APK downloads remain available without an F-Droid client.

The first catalogue is explicitly **IndiaFOSS Preview**. Publish reviewed builds that passed their required CI, not every main-branch build. Do not call these stable releases or imply inclusion in the official f-droid.org catalogue. Add Companion first; add Chat only after its signed public APK is available and verified. Keep Chat's current discovery/Matrix limitations visible in its description.

## Distribution decision

Use a separate public repository, proposed name `hanthor/indiafoss-android-repo`, with a GitHub Actions Pages deployment. Proposed endpoint: `https://hanthor.github.io/indiafoss-android-repo/fdroid/repo/`. This URL is a plan, not a working download destination.

The publisher consumes already-signed release APKs and uses fdroidserver to generate the catalogue. It does not rebuild or re-sign apps. Keep APKs out of git history; stage them in a Pages deployment artifact. The Companion PWA's SPA fallback and service worker must not intercept repository indexes or APK requests.

Preserve each application's package ID and signing certificate:

| App       | Package ID                          | Existing certificate SHA-256                                       |
| --------- | ----------------------------------- | ------------------------------------------------------------------ |
| Companion | `org.indiafoss.companion.nativeapp` | `6eeeafa8b7ea0178388f9f18704f1e8b631dba798a763d0e75e20b4d9e9b2db1` |
| Chat      | `org.indiafoss.chat`                | `137cde918f4b669ef9eea1985531af0f43b5dd98ca9db17032894370bddf5175` |

These values must also be checked against the actual APK, not trusted just because a release JSON repeats them. A same-package, same-certificate APK with a higher version code is the intended in-place upgrade path. Prove data retention on devices before promising seamless switching. A differently signed installation cannot use this path.

Generate a separate, backed-up repository-index key once. The publisher needs that key, not either application's private signing key. Publish its fingerprint with the add-repository link and QR code. Never invent a fingerprint or regenerate a key on an ordinary build.

## Small implementation steps

1. **Scaffold the hosting repository.** Add a pinned fdroidserver environment, app metadata, package/certificate allowlist, source links, and a locally generated unsigned preview artifact. Confirm app licences and the Chat FOSS variant from source before final metadata. Do not expose private config in deployed files.
2. **Collect exact release inputs.** A promotion manifest identifies source commit, release/asset IDs, version code, SHA-256 and expected signer. Fetch the recorded asset; reject changed bytes, wrong package/certificate, debuggable APKs and version-code regression. Mutable `nightly` URLs are discovery inputs, never the durable promotion record.
3. **Retain promoted versions.** Store immutable versioned APK copies before moving a rolling release. Stage the current and two previous promoted versions per app. Set a deployment size budget; fail without replacing the live repo when exceeded. The same version code must never acquire different bytes.
4. **Generate and verify the index.** Derive version data from the APKs, use fdroidserver metadata for names/descriptions/source links, and check that every indexed file exists with the expected hash. Pin the reviewed recommended version explicitly. Keep newer experimental nightlies out of the recommended update channel.
5. **Sign and deploy.** Only trusted publication jobs receive the index key. PR builds validate unsigned output without secrets. A manual promotion workflow initially validates the source commit's required CI, signs the staged index, verifies its fingerprint and uploads the complete Pages artifact. Concurrent promotions must be serialised.
6. **Rehearse upgrades.** Add the repository to F-Droid and another compatible client using the published fingerprint. Install from direct APK, then update through the repository; preserve talk choices, saved contacts and identity. Test Chat separately with actual accounts. Verify client behaviour with a missing APK, corrupt index, wrong signer and interrupted download.
7. **Expose attendee links.** After anonymous HTTPS index/APK checks and the upgrade rehearsal pass, add the fingerprint-bearing repository link, copyable URL and QR to PWA Home/Settings and the download page. Explain installing a compatible client when absent. Keep direct APK as the fallback.
8. **Automate promotion later.** Once the manual path is reliable, release events can propose a promotion manifest. A publication failure keeps the last valid catalogue. Removing a bad release can stop further installs, but cannot downgrade phones; ship a fixed APK with a higher version code.

## Acceptance evidence

- Publisher tests reject package/signature/hash/version mismatches and missing indexed files.
- A repository-signature check uses the separately recorded public fingerprint.
- Both clients can add the repository and install the promoted Companion release.
- A direct-download installation receives an update without uninstalling and retains data.
- Chat is absent until an actual signed compatible APK exists; inclusion requires its own upgrade test.
- No app keys, repository key, passwords or private signing config occur in Pages artifacts or logs.
- Public links are added only after the deployed endpoint works. Track physical upgrade evidence with #226; repository delivery does not complete #240 browser-to-native migration.

## References

- [F-Droid: setting up a binary app repository](https://f-droid.org/en/docs/Setup_an_F-Droid_App_Repo/)
- [F-Droid: separate index and APK signing](https://f-droid.org/en/docs/Signing_Process/)
- [SchildiChat's Android distribution channels](https://download.schildi.chat/legacy/android/)
