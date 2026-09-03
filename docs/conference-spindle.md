# The conference Spindle: hosting it, and taking part from anywhere

The venue mesh runs on phones (Neutrino over Bluetooth LE). People who are
not at the venue, and phones that come back online, need a place on the
internet that speaks Matrix: a [Spindle](https://github.com/tuna-os/spindle)
that we host for the conference (issue #115). This note is what to run, what
the app does with it, and where the two worlds still do not meet.

## What to run

Spindle is one binary and one TOML file; no database, no identity service,
no reverse proxy for a first login (per its README). Build it from source:

```bash
git clone https://github.com/tuna-os/spindle && cd spindle
cargo build --release -p spindle-server --bin spindle
```

The minimum config, from `spindle.example.toml`:

```toml
[server]
name = "chat.example.org"          # baked into every user and room id: pick once
bind = "0.0.0.0:8008"              # client-server listener
public_base_url = "https://chat.example.org"   # what .well-known hands to clients

[storage]
path = "/var/lib/spindle"

[federation]
bind = "0.0.0.0:8448"              # federation listener; TLS is required here
tls_cert = "/etc/spindle/fullchain.pem"
tls_key = "/etc/spindle/privkey.pem"

[ratelimit]
enabled = true                     # on by default; keep it on facing the internet
```

Put a TLS terminator in front of the client-server port (or bind it behind
one), serve `/.well-known/matrix/client` and `/.well-known/matrix/server`
from `example.org` pointing at it, and open registration for attendees or
hand out accounts; Spindle takes the ordinary dummy-flow registration
(`POST /_matrix/client/v3/register` with `m.login.dummy`) and password login,
which is what the app uses.

Then seed the rooms, from any Matrix client signed in as the organiser
account on the Spindle: the announcements room
(`#<prefix>-announcements:<server>`; the app creates it with moderator-only
posting when the organiser opens it first, see `docs/messaging.md`), and
optionally the session rooms, which the app otherwise creates on first use
with deterministic aliases.

Point the event bundle at it (`messaging.homeserver`, `aliasServer`,
`aliasPrefix`; `docs/messaging.md`).

## Taking part from anywhere

A remote attendee opens the app's chat page and signs in with **their own
Matrix account**, on any homeserver, or with an account on the conference
Spindle; the homeserver field defaults to the conference one. The session,
booth and venue rooms join by alias on the conference server, which is plain
federation when the account lives elsewhere. Announcements, session Q&A and
direct messages work the same as at the venue.

What the app checks before trusting a Spindle (the chat contract probe,
`tools/neutrino-probe`, run with `PROBE_GAPS=0` so only the contracts apply):
registration and login, room creation, messages and history, reply
relations, reactions, `/members`, and sync. Spindle at the pinned commit
does not advertise Simplified Sliding Sync (MSC4186), so the client uses
legacy `/sync` against it, which the probe checks; registration is the
spec's two-step dummy flow (a UIAA session first), which Neutrino also
accepts. Proven against a source build of Spindle `70b56eb`: all seven
contracts pass. Run it against a local Spindle before the conference:

```bash
NEUTRINO_URL=http://127.0.0.1:8008 PROBE_GAPS=0 pnpm --filter @indiafoss/neutrino-probe test
```

## Where the mesh and the Spindle still do not meet

The venue mesh and the conference Spindle are two worlds joined by people,
not by federation, until the RFC in `docs/spindle-rfc.md` is answered (ADR
0003: room-version convergence and event signing on the Neutrino side). Until
then:

- A person at the venue sees mesh rooms; the same person, signed into the
  Spindle, sees the Spindle's rooms. The app shows which is which.
- The verified Matrix-id link (#111) is the bridge between identities: a
  mesh contact's card names their Spindle (or matrix.org) account, checked
  against that account's own profile, with "Continue on Matrix" on mesh DMs.
- Live mirroring of mesh rooms into the Spindle stays out, by ADR 0003: a
  bridge would read every conversation.

Once the RFC lands, the mesh becomes the offline copy of the Spindle's rooms
and the Spindle the catch-up point for a phone coming back online, with no
change to what attendees do.
