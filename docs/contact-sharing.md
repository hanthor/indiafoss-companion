# Contact sharing

## One card, one QR (redesign, 2026-09)

`/connect` shows a single, always-live QR code. It is a plain **vCard 3.0**,
so any phone camera saves the attendee straight to Contacts. Fields the
companion understands ride along as `X-` extension properties, which camera
apps ignore and the companion scanner reads:

| Property                       | Meaning                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `X-INDIAFOSS-MESH`             | Neutrino node id (64 hex): lets a scanned contact message you on the venue mesh                    |
| `X-INDIAFOSS-MATRIX`           | Public Matrix id, opened in Element                                                                |
| `X-INDIAFOSS-TICKET`           | `ticket::<id>` correlation key for organisers; never an identity                                   |
| `X-INDIAFOSS-KEY`              | This device's handshake public key (`alg:base64url`)                                               |
| `X-INDIAFOSS-SIG`              | Signature over every other line of the card, by that key                                           |
| `X-INDIAFOSS-IDENTITY-VERSION` | Envelope version of the mesh/Matrix fields (`1`); see [identity-envelope.md](identity-envelope.md) |

The signature covers the whole body including the key line, so a card whose
key was swapped does not verify. A card from any other app simply has no
key and is shown as **unsigned**, never as an error. The scanner derives the
same 5×5 pixel key badge from `X-INDIAFOSS-KEY` that the owner sees on their
own Connect screen, which is the in-person check.

The older spellings (`X-MATRIX-ID`, `X-NEUTRINO-SERVER-NAME`,
`X-INDIAFOSS-TICKET-REF`) and the `indiafoss://friend?v=1` link are still
accepted by the scanner for cards already in circulation. A card with no
`X-INDIAFOSS-IDENTITY-VERSION` reads as version 1; a card declaring a version
this build does not know keeps its identity fields unread — shown as "Identity
format this app can't read yet", never as an address and never as a mismatch
([identity-envelope.md](identity-envelope.md), #160).

Every field is one row: label, editable value, share switch. Groups and
defaults:

- **Identity** (on): name, organisation, website, and the photo row.
  "From my contacts" fills them from the attendee's own entry in the
  phone's contacts (#94): the Contact Picker API where the browser has it
  (Chrome on Android), otherwise a `.vcf` shared out of the Contacts app and
  picked here (iOS, and the Android app's WebView). Nothing is uploaded.
- **Profiles & links** (on, already public): FOSS United, then GitHub,
  LinkedIn, Mastodon by default; "+ Add" for more networks. The FOSS United
  profile is one profile among the others (#96), on the card as
  `URL;TYPE=profile` and shown as a link chip on speakers and contacts like
  any other. "Fill from my profiles" reads every public profile the card
  links to at once — the FOSS United page (Android only, see below) and the
  GitHub API (works on the web too) — fills only empty fields, lists what it
  filled, and can be taken back in one tap. A newly filled link is shared
  unless switched off.
- **Private** (off, amber): email, phone. A QR can be photographed.
- **Companion extras** (mesh id on, Matrix id on, ticket off): other camera
  apps ignore these.

Empty fields are never encoded whatever their switch says. The card is
re-encoded a beat after each edit and the profile is saved at the same time;
"N fields · B bytes" and "SIGNED" under the QR reflect the current payload.

"People I met" lists scanned contacts newest first, grouped by day, with the
key badge, where you met (the session running at scan time) and the
signature state; search, export (.vcf / JSON backup) and import live in the
same section.

## Photo (#95)

The card can carry a `PHOTO;VALUE=URI:` link — never the bytes, which would
not fit a QR. `avatarUrlFor()` picks, in order: a picture the profile states
(imported from FOSS United or GitHub), the GitHub avatar
(`github.com/<user>.png`) when the GitHub link is shared, then a Gravatar
(SHA-256 of the email, `d=404`) only when the email is shared, since the hash
identifies it. The photo switch in the Identity group turns it off. The
scanner keeps an https `PHOTO` link on a scanned card and "People I met"
shows it, falling back to the key badge; a broken link falls back too.

## Privacy guarantees

- **No account, no upload.** The card is generated entirely on-device with
  `attendeeProfileToVCard` (`packages/model/src/contact.ts`). Nothing is sent to
  any server. The QR image is rendered locally from the vCard payload itself.
- **The QR encodes the vCard, not a tracking URL.** Scanning the code yields the
  contact fields directly. There is no redirect, shortener, or analytics hop, so
  no third party learns who scanned whom.
- **Explicit, per-field selection.** The attendee chooses exactly which fields
  are encoded. Defaults are conservative:
  - On by default: name, organization, website, FOSS United profile URL.
  - Off by default: email, phone, Matrix ID, and every social link.
    See `DEFAULT_ATTENDEE_SHARE_SELECTION`.
- **Local storage only.** Profile and selection are persisted through
  `CompanionStorage` under `attendee-profile` / `attendee-share-selection`,
  which is the same on-device store used by the rest of the app.
- **No messaging.** Matrix ID is shareable as an identifier only; the conference
  MVP does not enable messaging (see issue #11).
- **Honest threat model.** The UI states that a QR code can be photographed and
  re-shared by anyone who sees it, and that scanning is not identity
  verification. Email/phone stay off unless the attendee opts in.
- **The Matrix-id-to-mesh link is checked, not trusted (#111).** When a card
  carries both a Matrix id and a mesh node id, the app checks, once online,
  that the Matrix account's own public profile names that mesh id, and shows
  "Profile matches", "Claimed" or "Does not match" next to it. The check is
  one read of a public profile from the account's homeserver; it sends nothing
  about the contact or the conversation anywhere. A match is the homeserver's
  word about its own user and is never shown as "Verified" (#188).

## Trust states, kept apart (#31, #188)

A contact screen shows five separate facts and never folds them into one
badge. `deriveContactTrust()` in `apps/web/src/lib/contact-trust.ts` derives
them from the stored record alone, and
`packages/test-fixtures/fixtures/contact-trust/states.json` is the shared table
of what each stored shape must produce.

| Line             | States                                                                                                                                                             | What it proves                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Card key**     | Card signed · badge _xxxx_ / Card signature invalid / Unsigned card / Key changed since an earlier card                                                            | The card came from a phone holding this key. Not who was holding the phone: a photographed QR carries the same signature.                                                                                                                                                                                                                             |
| **In person**    | Badge compared in person / … for an earlier key / Badge not compared in person / No badge to compare                                                               | The attendee's own tap after comparing badges on `/connect/compare`. Bound to the fingerprint; a new key does not inherit it.                                                                                                                                                                                                                         |
| **Account link** | Profile matches / Does not match / Account link claimed, not checked yet / … profile names no mesh id / Card predates a format change                              | Whether the Matrix account's public profile names the card's mesh id. The homeserver's word; at most `profile-matched`.                                                                                                                                                                                                                               |
| **Binding**      | Binding signed by both keys · Matrix key not confirmed in Chat / Binding expired / revoked / does not check out / format this app can't read yet / not checked yet | This app's own verification of a signed mesh↔Matrix binding the card carried (`docs/identity-binding.md`): the card key and a Matrix key both signed one statement naming these identities. A valid one lifts the account line to `binding-valid` — and no further, because the Matrix key came from a server, not a person. No card carries one yet. |
| **Chat**         | Not verified in Chat                                                                                                                                               | Matrix device verification. Nothing here can produce "Verified in Chat"; that branch exists and is unreachable (#188).                                                                                                                                                                                                                                |

Every record that arrives from somebody else — a scan, a shared link, an
imported contact book — passes through `asReceivedRecord()` first: `verified`
becomes `false`, `accountTrust` becomes `claimed`, and any in-person
confirmation, profile observation or binding verdict in the file is dropped
(a signed binding itself is kept: it is data, and is re-checked here). A card
cannot assert its own trust. Records written by builds that spelled a profile match
`meshLink.state === 'verified'` read back as `profile-matched`
(`migrateContactRecord()` in `@indiafoss/storage`).

Opening a chat is a third, separate action. A web page cannot see which apps
are installed, so each route button carries its caveat ("Opens IndiaFOSS Chat
if it is installed and the mesh is up. This app cannot tell whether it is."),
and a card with no Matrix or mesh id says "No known chat route" rather than
offering a dead button. No route is ever chosen automatically (ADR 0006,
gated on #188).

## vCard compatibility decisions

- **vCard 3.0.** Chosen for the widest importer support across Android Contacts,
  iOS Contacts, and desktop clients. 4.0 is stricter and less universally
  handled by camera-app "add contact" flows.
- **CRLF line endings and a trailing CRLF.** RFC 2426 / 6350 require `\r\n`
  line breaks; some importers reject LF-only payloads.
- **Both `FN` and `N`.** `FN` is the display name; `N` is the structured
  name (`family;given;;;`). We derive `N` by treating the last whitespace token
  as the family name and the remainder as the given name — a pragmatic split
  that keeps single-name and multi-word names importable.
- **Escaping.** `\`, `,`, `;`, and newlines are escaped per spec so names like
  `Comma, Person; Name` round-trip correctly.
- **Unicode is preserved as-is.** UTF-8 text (Devanagari, accented Latin, emoji)
  is passed through unescaped except for the reserved characters above.
- **URLs.**
  - Website → `URL;TYPE=website`.
  - FOSS United profile → both `URL;TYPE=profile` (portable) and
    `X-FOSSUNITED-PROFILE` (self-describing extension).
  - Socials → `X-SOCIALPROFILE;TYPE=<network>` extension, one per selected
    network.
- **Matrix.** Emitted as both `X-MATRIX-ID` and `IMPP:matrix:<id>` so
  IMPP-aware clients can recognise it.
- **QR size guard.** Before rendering, the payload is measured; anything over
  1500 UTF-8 bytes is rejected with guidance to remove optional fields, because
  dense QR codes scan poorly on phone cameras. Error-correction level `M`
  balances resilience against density.

## Getting your chat id onto the card

Nobody reads a 64-hex node id off one screen and types it into another at a
booth, so IndiaFOSS Chat hands it over. The "My code" sheet on a mesh
account's own profile has **Add to my Companion card**, which opens
`indiafoss://conference/connect?mesh=<node id>` (an internet account sends
`?matrix=<@user:server>`). `ConferenceActivity` routes that to the Companion,
native app or PWA, where `/connect` shows the id and asks before writing it
(the removed `apps/web/src/lib/identity-handback.ts`; see the note in [messaging.md](messaging.md)). On yes, the field is filled and
its share switch turned on; a junk value never asks. Only the public address
the card would carry anyway crosses the app boundary.

## Reaching someone you saved

A saved contact offers its chat routes as links: the mesh address first,
then a public Matrix id. A web page cannot see which apps are installed, so
the caveats say so, and the Matrix caveat says the honest extra thing: a
mesh-only IndiaFOSS Chat cannot reach a public Matrix account. On Android
Chrome the mesh route is an `intent://` link naming Chat's package with the
Settings download card as its browser fallback (`intentHrefFor()` in
`apps/web/src/lib/contact-trust.ts`), so a missing Chat lands on "Get
IndiaFOSS Chat" instead of a tap that does nothing.

## Sharing surfaces

- **QR code** for in-person, camera-based exchange.
- **Download `.vcf`** via `downloadTextFile` for saving/importing directly.
- **Share sheet** via the Web Share API (`navigator.share` with a `.vcf`
  `File` when `canShare` allows it), falling back to a `.vcf` download when the
  platform has no share target.

## Tests

`packages/model/src/contact.test.ts` covers defaults and opt-in-only omission,
explicit selection of email/phone/Matrix/socials, escaping of reserved
characters, Unicode preservation, empty (nothing-selected) cards, and omission
of whitespace-only values.

# QR scanning: contacts and venue locations

The Scan screen (`/scan`) lazily loads a QR engine to read two payload kinds and
always shows a confirmation preview before importing anything.

## Supported payloads

- **Location marker:** `indiafoss://location/<location-id>`. On confirm, the
  map opens on that room (`/map/to/<id>`). Nothing is stored: the app does
  not track a current location.
- **Contact card:** a vCard 3.0 payload (as produced by the Connect screen).
  On confirm, the received card is offered as a local `.vcf` download. It is
  never merged into the attendee's own profile automatically.

## Parsing and safety (`packages/model/src/scan.ts`)

`parseScannedPayload` is a pure classifier that returns a discriminated result
(`location` | `contact` | `error`) so the UI can preview before mutating state:

- **Empty** input is rejected.
- **Oversized** input (> `MAX_SCAN_PAYLOAD_BYTES` = 8 KiB UTF-8) is rejected
  before any parsing, guarding against QR-bomb payloads.
- **Unsupported** payloads (non-IndiaFOSS schemes, non-vCard text, or an
  `indiafoss://` link that is not a `location/` link) are rejected.
- **Malformed** location links or unreadable vCards are rejected.
- The classifier keys off the opening token (`indiafoss://` vs `BEGIN:VCARD`),
  so a payload can only ever resolve to one kind; there is no silent guessing.
- `parseVCard` unfolds RFC 6350 folded lines, unescapes `\,`, `\;`, `\n`,
  reads `FN`/`N`/`ORG`/`EMAIL`/`TEL`/`URL`/`X-FOSSUNITED-PROFILE`/`X-MATRIX-ID`/
  `IMPP:matrix:`/`X-SOCIALPROFILE`, preserves Unicode, and returns `null` for a
  card with no usable identity. It round-trips the Connect screen's output.

Unit coverage lives in `packages/model/src/scan.test.ts`; the manual-entry
fallback, preview gating, import, and junk rejection have Playwright coverage in
`apps/web/tests/app.spec.ts`.

## Camera and permissions

- The QR engine (`qr-scanner`) is dynamically imported only when the attendee
  taps **Start camera**, so no camera permission is requested on page load.
- `qr-scanner` prefers the native `BarcodeDetector` when available and falls
  back to a bundled WASM worker (loaded as a Blob, no separate asset), so
  scanning works offline once the PWA shell is cached.
- The camera stream is stopped and the scanner destroyed when leaving the page
  or when a payload is captured.
- Permission-denied and no-camera cases surface a message pointing at the
  manual fallback.

## Manual / keyboard fallback

Every scan path has a no-camera equivalent:

- **Location:** a `<select>` populated from the venue metadata; choosing an
  entry and pressing Preview runs the same `indiafoss://location/<id>` path.
- **Contact:** a textarea to paste a vCard, which runs the same parser and
  preview.

## Web/PWA vs Android deep links

- **In-app scanning (both platforms):** identical behaviour. The `/scan` route
  parses payloads locally and previews before applying.
- **Web/PWA URL deep links:** `indiafoss://location/<id>` and the
  `/h/view-location` handoff both land in the scan preview and open the map
  on that room.
- **Android custom-scheme deep links:** the native app registers the
  `indiafoss` scheme so an OS-level scan of `indiafoss://location/<id>` opens
  the app on the location. Contact vCards are handled in-app rather than via a
  custom scheme, because `.vcf` is already a first-class OS import type — an
  attendee can scan with any camera app and import the card through the system
  contacts flow, matching the privacy model (the QR encodes the card itself,
  not a URL).

## Handshake cards (signed friend cards and key badges)

The companion friend card (`indiafoss://friend?v=1…`) is **signed** by a
key pair the device generates once (WebCrypto Ed25519, ECDSA P-256 as a
fallback; the private key is non-extractable and lives in IndexedDB). The
card carries `pk` (`alg:base64url`) and `sig` over its other fields.

- **Scanning** verifies the signature and shows ✔ signed / ✖ altered /
  unsigned, plus a **key badge**: a 5×5 mirrored pixel identicon derived
  from the SHA-256 fingerprint of the public key. The same badge is shown on
  the owner's Connect screen, so two people can compare badges in person — a
  quick, playful check that the card really came from that device.
- **Meeting context** is saved with the contact, assuming you were following
  your plan: the planned talk or block under way when you scanned (else the
  programme's running session), so the contact list reads "Met during
  _Kernel devroom_" or "Met during _Lunch, day 1_".
- This is a **handshake, not identity verification**: it proves the card was
  produced by the holder of a key, not who they are. Matrix cross-signing
  remains the authenticity mechanism for messaging, and every contact still
  shows "Not verified in Chat".
- **"Badges matched in person"** is the attendee's own statement, made on
  `/connect/compare` or from a contact's detail panel after holding the
  phones together. There is no channel by which one phone learns that the
  other scanned it, so this is deliberately not a mutual-scan flag; it
  records the comparison the attendee actually did, bound to the card key it
  was done for.

### Dated cards: a live code versus a photograph (borrowed from SimpleX)

SimpleX hands out one-time invitation links so a copied link is worthless.
A QR on a badge cannot be one-time, but it can be **dated**: every signed
rendering carries `X-INDIAFOSS-ISSUED` (ISO 8601) and `X-INDIAFOSS-NONCE`
(nine random bytes) inside the signed body, and the friend payload carries
the same as `issued` and `nonce`. The Connect screen re-issues the card
every five minutes while it is showing and whenever it comes back to the
front, so the code on a phone is never more than a few minutes old.

- **Scanning** reads the issue time only off a card whose signature is
  valid (`cardFreshnessOf`): an unsigned or altered card can claim any
  date. A code older than `CARD_FRESH_MINUTES` (60) is flagged in the
  preview as a photograph or screenshot, and the row keeps that verdict as
  "code older than 60 min when scanned". The verdict is judged against the
  scan time (`freshnessAtScan`), never against now: a card saved yesterday
  is not stale for having aged in the list.
- A card from a build that does not date its cards is `unknown`, which is
  no warning at all.
- The nonce is stored as `cardNonce`; two scans that carry the same nonce
  saw the same rendering. Nothing reads it yet beyond storing it.

### "Now show yours": the reciprocal half (borrowed from SimpleX)

A SimpleX contact is never one-sided. After a card is saved, the scan
screen shows the attendee's own card, freshly issued, under **Now show
yours**, with one button: **They scanned mine**. That sets
`ContactRecord.mutual`, shown as MUTUAL EXCHANGE on the row and reversible
from the row's actions.

There is still no channel by which one phone learns that the other scanned
it, so `mutual` is the attendee's own statement, like the badge comparison,
and is dropped on import with every other local conclusion. It does not
touch the account, in-person or chat lines.

Ideas that build on the same primitives (not implemented): mutual-scan
confirmation carried over the mesh, an NFC tap that writes the friend card to a
badge, and a local "hallway passport" that stamps sessions, booths and people
you met into a shareable pixel-art card.

## Messenger deep links (Telegram, WhatsApp, Signal, phone, Matrix)

Profiles and saved contacts can carry a Telegram handle, a WhatsApp number
and a Signal number or username alongside phone, email and Matrix id.
`contactDeepLinks()` in `@indiafoss/model` turns whatever is present into
tap-to-open links using only public, documented schemes:

| Identity        | Link                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Phone           | `tel:+91…`, `sms:+91…`                                                                              |
| Email           | `mailto:`                                                                                           |
| Matrix id       | `https://matrix.to/#/@user:server`                                                                  |
| Telegram handle | `https://t.me/<handle>`                                                                             |
| WhatsApp number | `https://wa.me/<digits>` (falls back to the phone number when no separate WhatsApp number is given) |
| Signal          | `https://signal.me/#p/+<number>` or `https://signal.me/#u/<username>`                               |

Values that do not parse as a handle or number are skipped rather than
guessed. Messenger fields are **off by default** in the share card like every
other contact field; when shared they ride in the vCard as
`X-SOCIALPROFILE;TYPE=telegram|whatsapp|signal` and in the friend card as
`social_<network>`. On the Scan preview and in the saved-contacts list they
appear as buttons; nothing is sent automatically.

## Developer profiles first: LinkedIn, GitHub, personal sites

At a FOSS conference the links people actually swap are a personal site,
GitHub and LinkedIn, so:

- they are **on by default** in the share card (`DEFAULT_ATTENDEE_SHARE_SELECTION`
  ticks `github` and `linkedin`; `website` was already on), while email, phone,
  Matrix, Neutrino, ticket and the chat messengers stay opt-in;
- every link list — speaker pages, the speakers block on a session, booths,
  the scan preview and saved contacts — renders through `SocialLinks.svelte`
  as labelled icon buttons ordered website → GitHub → GitLab → LinkedIn →
  Mastodon → Bluesky → X → Matrix → messengers → email → phone;
- speaker links from FOSS United arrive with the generic label "social", so
  `classifyLink()` recognises the network from the host (LinkedIn including
  regional subdomains, GitHub, X/Twitter, Bluesky, YouTube, fediverse `/@user`
  paths) and treats anything else as the person's website.

## Importing your FOSS United profile

Connect can fill the card from your public profile at
`https://fossunited.org/u/<username>`: display name, personal site and the
social links in the profile header (GitHub, GitLab, LinkedIn, Mastodon,
Bluesky, X, Instagram, YouTube, Medium, dev.to). Only empty fields are filled,
so nothing you typed is overwritten, and imported socials are marked shared by
default because they are already public. The parser is
`packages/sources/src/fossunited/parse-profile.ts`, fixture-tested against a
captured profile page; nothing about you is sent anywhere, the page is only
read.

`fossunited.org` sends `Access-Control-Allow-Origin: https://fossunited.org`,
so a browser cannot read the page from the companion's origin, and the import
is attempted anyway and, when the browser blocks it, the UI says so and the
fields stay manual. The retired Capacitor build used to bypass this with a
native HTTP fetch; the native Compose app doesn't have profile import at all
yet ([#110](https://github.com/hanthor/indiafoss-companion/issues/110)), so
for now this only ever works on the web.

## Handles or URLs, and Prav

A social link takes a handle or a full URL (#105): `alice`, `@alice`,
`github.com/alice` and `https://github.com/alice` all mean the same GitHub
profile, a fediverse handle (`@alice@fosstodon.org`) is a Mastodon profile,
and a Bluesky handle is its domain. `socialProfileUrl()` in the model (and
`VCard.socialUrl` natively) turns any of them into the canonical profile
URL; the card, the deep links and the saved contact all carry that URL, so
a handle typed on one phone reads as a link on any other.

Prav (#106), the community's XMPP service, is its own network on the card:
it takes the phone number the account was made with, a username, or a full
JID, and `pravJid()` makes the JID on `prav.app` (`+919876543210@prav.app`).
It is encoded as `X-SOCIALPROFILE;TYPE=prav` plus an `IMPP:xmpp:` line other
address books understand, linked as `xmpp:` and shown as Prav; an XMPP
address on any other server stays under XMPP.

## Who I met, and the card you can share

`/connect/recap` (#31) reads the conference back as the people you met. It
groups them by day and by where you were standing when you scanned them: the
session running at the time, otherwise the room, otherwise "Around the venue".
Within a day the busiest place comes first. `buildRecap()` in
`apps/web/src/lib/recap.ts` is pure and does the grouping; it works with no
event bundle at all, which is what happens if the recap is opened after the
programme has been cleared.

The shareable card is drawn on a canvas from the same data
(`recap-image.ts`), so the preview on screen is exactly the file that gets
saved. It always wears the dark brand look rather than the viewer's theme,
because it leaves the device and should look like IndiaFOSS wherever it lands.
It carries the count, a line of stats (how many days, the busiest place, who
you met more than once, how many cards were signed) and up to twelve names
with an "and N more" tail so it cannot grow without bound.

**Names are a switch.** They are on by default, since it is your own recap,
and one toggle drops them so the card carries only the count and the places.
Nothing is uploaded: the picture is drawn locally and handed either to the
system share sheet as a real PNG file, or to a download when the browser
cannot share files.
