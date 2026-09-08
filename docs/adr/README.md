# Architecture Decision Records

Records of significant, hard-to-reverse architecture decisions for IndiaFOSS
Companion. Each ADR is immutable once accepted; supersede rather than edit.

Format: [MADR](https://adr.github.io/madr/)-style. Numbering is zero-padded and
sequential.

## Index

- [0001](0001-native-android-client-standalone-vs-neutrino-fork.md) —
  Native Android client: standalone vs Neutrino-fork feature layer
- [0002](0002-native-compose-client-rendered-natively.md) —
  The native client renders natively, with a Kotlin port of the core engines
- [0003](0003-mesh-interop-by-federation-not-bridging.md) —
  Mesh ↔ internet interop is native federation, not a bridge
- [0004](0004-retire-the-capacitor-shell.md) —
  Retire the Capacitor shell; three apps, not four
- [0005](0005-ios-mesh-chat.md) —
  iOS and the mesh: staged, with the Spindle carrying iPhones first
- [0006](0006-one-person-two-transports.md) —
  One person, two transports: seamless mesh ↔ Matrix in one app
  ([implementation notes](0006-implementation-notes.md))
- [0007](0007-voice-video-over-the-mesh.md) —
  Voice and video over the mesh: iroh media, MatrixRTC signalling
- [0008](0008-mesh-identity-and-discovery.md) —
  Mesh identity in the chat app: a code you can read, a QR you can scan, a
  switch to go dark
- [0009](0009-versioned-contracts-and-golden-fixtures.md) —
  Versioned contracts and golden fixtures live in Companion, one directory,
  one fixture suite
