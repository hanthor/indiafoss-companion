# Accrescent: installing the app and keeping it current

[Accrescent](https://accrescent.app) is a security- and privacy-focused
Android app store. It is the distribution channel we want for the native
Compose app: it verifies the app's signing key against a hash in signed store
metadata (so even the _first_ install is checked, with no trust-on-first-use
gap), it signs its repository metadata with a key baked into the client, and
it updates apps in the background without asking for anything privileged.

**Status: not published there yet.** Accrescent's developer sign-up is closed
— "Sign-up is not yet available to the general public and is only permitted
for allowlisted GitHub accounts… We are not currently accepting new allowlist
requests" ([docs](https://accrescent.app/docs)). Until that opens, the Android
app ships as the nightly APK from
[GitHub Releases](https://github.com/hanthor/indiafoss-companion/releases/tag/nightly).
The first half of this page is what attendees will do once we are listed; the
second half is what we have to have ready for that day.

## For attendees: getting the app and staying up to date

1. **Install Accrescent.** Download it from
   <https://accrescent.app/accrescent.apk> and open the file. Android asks you
   to allow your browser to install apps; that permission is for Accrescent's
   installer only and can be turned off afterwards. On GrapheneOS, install
   Accrescent from the GrapheneOS App Store instead — that is the route
   Accrescent recommends for those devices.
2. **Check what you downloaded** (optional but quick). The signing certificate
   should hash to
   `067a40c4193aad51ac87f9ddfdebb15e24a1850babfa4821c28c5c25c3fdc071`:

   ```bash
   apksigner verify --print-certs accrescent.apk | grep -i 'SHA-256'
   ```

   Accrescent asks that you compare that hash against a source other than the
   page you downloaded from.

3. **Install the Companion.** Search for _IndiaFOSS Companion_ in Accrescent
   and install it. No account, no sign-in: Accrescent needs no account to
   install apps.
4. **Updates take care of themselves.** Accrescent asks for confirmation the
   first time it installs an app, then updates that app in the background
   without prompting. Unattended updates need **Android 12 or newer**;
   Accrescent itself runs on Android 10 and up, and on Android 10 or 11 you
   confirm each update. Automatic updates are on by default and can be turned
   off in Accrescent's settings, in which case it posts a notification when an
   update is waiting instead of installing it.

Two things worth knowing:

- Accrescent only auto-updates apps **it installed**. If you already have the
  Companion from the nightly APK, uninstall it first and reinstall from
  Accrescent, or Accrescent will not be the app's update owner.
- You need nothing else running. There is no push service and no background
  account; Accrescent checks for updates on its own schedule.

## For maintainers: what publishing needs

The developer console is <https://console.accrescent.app> and the only login
method is GitHub. When the allowlist reopens, these are the concrete
differences from an ordinary Play or F-Droid release. All of it comes from
Accrescent's [publishing docs](https://accrescent.app/docs).

**The artifact is an APK set, not an AAB.** Accrescent does not sign apps
itself, so we generate and sign the split APKs and upload the resulting
`.apks` file. With the bundletool Gradle plugin (Android Gradle Plugin 7.4.0
or newer) that is `./gradlew buildApksRelease`, which writes
`app/build/outputs/apkset/release/app-release.apks`; the bundletool CLI's
`build-apks` does the same with a non-debug keystore. The upload must be no
more than 1 GiB, which this app is nowhere near.

**Signing.** APK signature scheme v2, v3 or v3.1, exactly one signer — signing
with several certificates makes key rotation impossible, and Accrescent asks
that the signing key be rotated at least every two years. Debug certificates
are rejected, as are builds with `android:debuggable` or `android:testOnly`
set to true. Our CI currently produces debug artifacts on purpose, so a
release keystore is a prerequisite (see [release.md](./release.md)).

**Domain verification.** Accrescent is phasing in proof that you control the
domain behind the app id. `org.indiafoss.companion` means proving control of
`indiafoss.org` with a DNS TXT record at `_accverify.indiafoss.org` carrying a
code Accrescent emails. This needs whoever runs FOSS United's DNS, so it is
the long-pole item, not the build.

**Review.** A new app gets a human reviewer, and domain verification has to
complete before it is accepted. Updates are different: most publish
immediately on submission, and only an update that requests a **newly added**
sensitive permission goes back to manual review. That matters for us —
`READ_CONTACTS` is on Accrescent's sensitive list, and we request it for
"fill my card from my own contact entry". It is already in the manifest, so it
costs one review at submission rather than one per release.

**No self-updaters.** Accrescent prohibits in-app updaters and links that
push people to install from somewhere else. The "download the nightly APK"
route in the README is fine while it is our only channel, but an
Accrescent-listed build must not prompt for it in the app.

**Target SDK.** Accrescent follows Google Play's target SDK requirements, and
removes apps that fall behind rather than just making them less discoverable.
Our target SDK is kept current with each Compose toolchain bump. Accrescent
does not document a minimum SDK requirement, so ours is our own choice.

Two things Accrescent's docs say nothing about, so do not assume either way: a
developer fee (there is no mention of any payment; the project is funded by
donations, but nothing states that publishing is free), and any restriction on
Google Play Services or Firebase — apps do not even have to be open source.
Our own no-FCM, no-Play-Services rule comes from
[the release policy](./release.md), not from Accrescent.

## Checklist before we can submit

- [ ] An allowlisted GitHub account on <https://console.accrescent.app>
      (blocked on Accrescent reopening sign-ups).
- [ ] A release keystore, and CI producing a signed `.apks` APK set rather
      than a debug APK.
- [ ] Key rotation noted in the calendar (at least every two years).
- [ ] `_accverify.indiafoss.org` TXT record agreed with whoever runs FOSS
      United's DNS.
- [ ] A 512 × 512 PNG icon and the store listing text.
- [ ] The in-app and README nightly-APK prompts removed from the build that
      goes to Accrescent.
