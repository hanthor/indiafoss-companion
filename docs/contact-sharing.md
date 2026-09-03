# Contact sharing

## One card, one QR (redesign, 2026-09)

`/connect` shows a single, always-live QR code. It is a plain **vCard 3.0**,
so any phone camera saves the attendee straight to Contacts. Fields the
companion understands ride along as `X-` extension properties, which camera
apps ignore and the companion scanner reads:

| Property             | Meaning                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `X-INDIAFOSS-MESH`   | Neutrino node id (64 hex): lets a scanned contact message you on the venue mesh |
| `X-INDIAFOSS-MATRIX` | Public Matrix id, opened in Element                                             |
| `X-INDIAFOSS-TICKET` | `ticket::<id>` correlation key for organisers; never an identity                |
| `X-INDIAFOSS-KEY`    | This device's handshake public key (`alg:base64url`)                            |
| `X-INDIAFOSS-SIG`    | Signature over every other line of the card, by that key                        |

The signature covers the whole body including the key line, so a card whose
key was swapped does not verify. A card from any other app simply has no
key and is shown as **unsigned**, never as an error. The scanner derives the
same 5×5 pixel key badge from `X-INDIAFOSS-KEY` that the owner sees on their
own Connect screen, which is the in-person check.

The older spellings (`X-MATRIX-ID`, `X-NEUTRINO-SERVER-NAME`,
`X-INDIAFOSS-TICKET-REF`) and the `indiafoss://friend?v=1` link are still
accepted by the scanner for cards already in circulation.

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
  "verified", "claimed" or "does not match" next to it. The check is one read
  of a public profile from the account's homeserver; it sends nothing about
  the contact or the conversation anywhere.

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
  scanned id is written to the local `current-location` setting via
  `setCurrentLocation`, which drives leave-by / routing on the Now screen.
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
- **Web/PWA URL deep links:** the Now screen already accepts
  `indiafoss://location/<id>` / `?at=<id>` via `locationIdFromDeepLink`
  (`apps/web/src/lib/location.svelte.ts`), so a scanned or shared link resolves
  to the same current-location state.
- **Android custom-scheme deep links:** the Capacitor wrapper can register the
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
- **Meeting context** is saved with the contact: the session running when
  you scanned and your current location, so the contact list reads "Met
  during _Kernel devroom_".
- This is a **handshake, not identity verification**: it proves the card was
  produced by the holder of a key, not who they are. Matrix cross-signing
  remains the authenticity mechanism for messaging, and every contact still
  shows as unverified.

Ideas that build on the same primitives (not implemented): mutual-scan
"met in person" confirmation, an NFC tap that writes the friend card to a
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
so a browser cannot read the page from the companion's origin. The Android app
fetches it through `CapacitorHttp`, which performs the request natively and is
not subject to that rule. On the web the import is attempted anyway and, when
the browser blocks it, the UI says so and the fields stay manual.

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
