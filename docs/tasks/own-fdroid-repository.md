# Our Android update repository

Status: the IndiaFOSS Preview repository is live as of 26 September 2026. Its
signed index and add-repository link publish reviewed Companion builds; Chat
remains unpublished.

## Attendee experience

The PWA offers Download APK and Add our F-Droid repository. The live Preview
catalogue lists Companion; Chat remains metadata-only until its signed public
APK is available and verified. Direct APK downloads remain available without
an F-Droid client.

The first catalogue is explicitly **IndiaFOSS Preview**. It publishes reviewed
builds that passed their required CI, not every main-branch build. Do not call
these stable releases or imply inclusion in the official f-droid.org catalogue.
Chat remains metadata-only until its signed public APK and upgrade path are
verified.

## Distribution decision

The separate public repository is `hanthor/indiafoss-android-repo`, deployed
through GitHub Actions Pages at
`https://hanthor.github.io/indiafoss-android-repo/fdroid/repo`. This is the
live Preview endpoint; it is not the official f-droid.org catalogue.

The publisher consumes already-signed release APKs and uses fdroidserver to generate the catalogue. It does not rebuild or re-sign apps. Keep APKs out of git history; stage them in a Pages deployment artifact. The Companion PWA's SPA fallback and service worker must not intercept repository indexes or APK requests.

Preserve each application's package ID and signing certificate:

| App       | Package ID                          | Existing certificate SHA-256                                       |
| --------- | ----------------------------------- | ------------------------------------------------------------------ |
| Companion | `org.indiafoss.companion.nativeapp` | `6eeeafa8b7ea0178388f9f18704f1e8b631dba798a763d0e75e20b4d9e9b2db1` |
| Chat      | `org.indiafoss.chat`                | `137cde918f4b669ef9eea1985531af0f43b5dd98ca9db17032894370bddf5175` |

These values must also be checked against the actual APK, not trusted just because a release JSON repeats them. A same-package, same-certificate APK with a higher version code is the intended in-place upgrade path. Prove data retention on devices before promising seamless switching. A differently signed installation cannot use this path.

The deployed repository uses a separate, backed-up repository-index key. Its
public fingerprint is
`AD932C530715E9CAA39415F94E007002FB3DA0DD2583FF92DFC7F6DFE46CCCC2`. The
add-repository link and QR code publish this fingerprint. Never expose the
private key or regenerate it on an ordinary build.

## Small implementation steps

1. **Scaffold the hosting repository.** Add a pinned fdroidserver environment, app metadata, package/certificate allowlist, source links, and a locally generated unsigned preview artifact. Confirm app licences and the Chat FOSS variant from source before final metadata. Do not expose private config in deployed files.
2. **Collect exact release inputs.** A promotion manifest identifies source commit, release/asset IDs, version code, SHA-256 and expected signer. Fetch the recorded asset; reject changed bytes, wrong package/certificate, debuggable APKs and version-code regression. Mutable `nightly` URLs are discovery inputs, never the durable promotion record.
3. **Retain promoted versions.** Store immutable versioned APK copies before moving a rolling release. Stage the current and two previous promoted versions per app. Set a deployment size budget; fail without replacing the live repo when exceeded. The same version code must never acquire different bytes.
4. **Generate and verify the index.** Derive version data from the APKs, use fdroidserver metadata for names/descriptions/source links, and check that every indexed file exists with the expected hash. Pin the reviewed recommended version explicitly. Keep newer experimental nightlies out of the recommended update channel.
5. **Sign and deploy.** Only trusted publication jobs receive the index key. PR builds validate unsigned output without secrets. A manual promotion workflow initially validates the source commit's required CI, signs the staged index, verifies its fingerprint and uploads the complete Pages artifact. Concurrent promotions must be serialised.
6. **Rehearse upgrades.** Add the repository to F-Droid and another compatible client using the published fingerprint. Install from direct APK, then update through the repository; preserve talk choices, saved contacts and identity. Test Chat separately with actual accounts. Verify client behaviour with a missing APK, corrupt index, wrong signer and interrupted download.
7. **Expose attendee links.** The fingerprint-bearing repository link, copyable
   URL and QR are now exposed on the PWA Home and Settings download cards.
   Explain installing a compatible client when absent. Keep direct APK as the
   fallback while physical upgrade evidence is collected.
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
