/**
 * The capability namespace (C-11). One name means one thing in every
 * capability record and every issue, so `mesh.media.photo` cannot drift into
 * "the transcoder no longer breaks the body" in one place and "an attendee can
 * send a camera photo" in another: those are two names.
 *
 * Two rules travel with every consumer of a record:
 * - **Unknown is unavailable.** A name not listed in a record is a `false`.
 * - **`supported: false` is a record, not an absence.** It says somebody
 *   looked, on what, and what they found.
 */
export interface CapabilityDefinition {
  name: string;
  /** One line: what an attendee can do when this is supported. */
  meaning: string;
}

/** The twelve release scenarios `docs/architecture/system.md` requires a release to exercise. */
export const RELEASE_SCENARIOS: readonly { name: string; meaning: string }[] = [
  { name: 'scenario.fresh-install', meaning: 'A first install opens on the published schedule.' },
  {
    name: 'scenario.upgrade',
    meaning: 'An upgrade over the installed build keeps every saved choice.',
  },
  {
    name: 'scenario.airplane-mode',
    meaning: 'Everything an attendee needs works with all radios off.',
  },
  {
    name: 'scenario.wan-loss-lan-retained',
    meaning: 'Losing the uplink while the venue network stays up degrades honestly.',
  },
  {
    name: 'scenario.permission-denial',
    meaning: 'Denied camera, notification or nearby-device permission is explained, not fatal.',
  },
  {
    name: 'scenario.background-lock',
    meaning: 'Backgrounding and locking the phone keeps reminders and the mesh node alive.',
  },
  {
    name: 'scenario.restart',
    meaning: 'A restart restores the plan, the node identity and pending sends.',
  },
  {
    name: 'scenario.lost-acknowledgement',
    meaning: 'A send whose acknowledgement never arrives is shown as uncertain, not sent.',
  },
  {
    name: 'scenario.low-storage',
    meaning: 'Low storage fails a write loudly and never corrupts what is already saved.',
  },
  {
    name: 'scenario.key-rotation',
    meaning: 'Rotating a card or device key keeps existing contacts and history readable.',
  },
  {
    name: 'scenario.account-expiry',
    meaning:
      'A temporary account expiring is disclosed ahead and loses nothing the attendee exported.',
  },
  {
    name: 'scenario.gateway-restore',
    meaning: 'The venue gateway coming back converges mesh and homeserver rooms.',
  },
];

export const CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    name: 'schedule.offline',
    meaning: 'The published programme, plan and map are usable with no network.',
  },
  {
    name: 'schedule.update',
    meaning: 'A newer revision reaches an installed app and applies without losing choices.',
  },
  {
    name: 'room.directory.published',
    meaning: 'The canonical conference room list ships beside the manifest for the current event.',
  },
  { name: 'mesh.text', meaning: 'Two phones exchange text over the venue mesh with no uplink.' },
  {
    name: 'mesh.media.passthrough',
    meaning: 'The mesh transcoder passes a media body through unaltered.',
  },
  {
    name: 'mesh.media.photo',
    meaning: 'An attendee sends a photo from the camera and the other phone shows it.',
  },
  {
    name: 'mesh.media.voice',
    meaning: 'A recorded voice message arrives and plays on the other phone.',
  },
  {
    name: 'mesh.discovery.toggle',
    meaning: 'Turning nearby discovery off keeps the phone hidden, including across a restart.',
  },
  {
    name: 'chat.outbox.durable',
    meaning: 'Every send is recorded before dispatch and its state survives process death.',
  },
  {
    name: 'seam.encrypted.async',
    meaning:
      'Encrypted messages cross between the mesh and the homeserver while one side is disconnected.',
  },
  ...RELEASE_SCENARIOS,
];

/** The definition for a capability name, if the namespace knows it. */
export function capabilityDefinition(name: string): CapabilityDefinition | undefined {
  return CAPABILITIES.find((c) => c.name === name);
}
