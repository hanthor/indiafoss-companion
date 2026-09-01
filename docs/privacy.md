# Privacy

IndiaFOSS Companion is offline-first and account-free. This document
consolidates the app's privacy guarantees; feature-specific detail lives in the
linked docs.

## Core guarantees

- **No account, no sign-in.** The conference app never asks who you are.
- **No tracking, no analytics, no telemetry.** The app makes no outbound
  requests that transmit usage or personal data to third parties.
- **All attendee state is local.** Schedule bookmarks, Elo ratings, session
  dispositions, itinerary and manual edits, notes, current location, routing
  profile, and your contact card live only in this device's IndexedDB /
  local settings. Nothing is uploaded.
- **Network is only for event data.** The single network dependency is
  downloading (and later updating) the published `EventBundle` and venue
  assets. After one download, everything works offline.

## Contact sharing (opt-in)

- The vCard is generated on-device; the QR encodes the card itself, **not a
  tracking URL**. Nothing is uploaded.
- Field sharing is explicit and per-field. Defaults are conservative: name,
  organisation, website, and FOSS United profile URL are on; **email, phone,
  Matrix id, and every social link are off by default**.
- Scanning another attendee's code always shows a confirmation preview before
  anything is imported, and a received card is saved locally as a `.vcf` — never
  merged silently.

See [contact sharing & QR scanning](./contact-sharing.md).

## Location

- Your current location (set manually or by scanning an `indiafoss://location/…`
  marker) is stored locally and used only for on-device leave-by/routing.
- Camera permission for QR scanning is requested lazily — only when you open the
  scanner — and denial falls back to manual entry.

## Messaging

- Matrix/Neutrino messaging is **not** enabled in the conference MVP. A Matrix id
  can be shared as an identifier only.

## Calendar export

- Exported `.ics` files are generated locally and only leave the device through
  your explicit download or share action. See [calendar export](./calendar-export.md).

## Data you can clear

Because everything is local, uninstalling the PWA / clearing site data removes
all attendee state. There is no server-side copy to delete.
