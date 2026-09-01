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
