# Contact sharing: privacy guarantees and vCard compatibility

The Connect screen (`/connect`) lets an attendee build and share a contact card
from their existing FOSS United identity. It is deliberately local, opt-in, and
offline.

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
