/**
 * The versioned identity envelope (#160).
 *
 * Every surface that persists a person's messaging identity — the vCard QR,
 * the `indiafoss://friend` link, the JSON contact-book export, the saved
 * contact record, the handoff `matrix:` link — writes the same small set of
 * fields, and every one of them is a wire format that already lives on other
 * people's phones. Upstream has said the mesh identifier will change shape
 * (Element's "converging IDs"), and nothing here may guess what that shape
 * will be. What this module does instead is make the *decision* "is this an
 * identity shape this build understands" live in exactly one place, and give
 * every reader the same three outcomes:
 *
 * - **understood** — the fields are promoted to the routable `matrixId` /
 *   `neutrinoServerName` slots;
 * - **not understood** — the raw fields are kept verbatim under
 *   {@link IdentityEnvelope.retained} so a later build or export can still see
 *   them, but nothing is promoted: an unrecognised value is never rendered as
 *   an address and never overwrites a known one;
 * - **absent** — nothing to say.
 *
 * ## Version 1
 *
 * `version: 1` is what every card written before this module carried
 * implicitly, so an unversioned card reads as v1. Its fields are kept
 * deliberately separate and none of them is derived from another:
 *
 * | Field                | Meaning                                                   |
 * | -------------------- | --------------------------------------------------------- |
 * | `neutrinoServerName` | mesh node id: the node's ed25519 key as 64 lowercase hex  |
 * | `matrixId`           | classic Matrix account, `@user:server`                    |
 * | `publicKey`          | card key (`alg:base64url`, `handshake.ts`)                |
 * | `signature`, `fingerprint` | proof metadata for the card key (`signed-vcard.ts`) |
 *
 * When upstream specifies a converged identifier, that becomes `version: 2`
 * with its own reviewed migration (key continuity, revocation, canonical
 * rooms). A v1 reader meeting a v2 card lands in "not understood" above, which
 * is the neutral `outdated` state the trust screens already show — not a
 * `mismatch`, which is presented to the attendee as evidence of tampering.
 */

export const IDENTITY_VERSION = 1;

/** Whether a declared identity version is one this build reads. */
export type IdentityCompatibility =
  /** Exactly the version this build implements. */
  | 'supported'
  /** No version declared: a card from before versioning, read as v1. */
  | 'legacy'
  /** A newer integer version. Fields are retained, nothing is promoted. */
  | 'forward'
  /** Not an integer at all. Treated like `forward`: kept, never trusted. */
  | 'malformed';

export function identityCompatibility(version: unknown): IdentityCompatibility {
  if (version === undefined || version === null) return 'legacy';
  const text = typeof version === 'number' ? String(version) : String(version).trim();
  if (text === '') return 'legacy';
  if (!/^[1-9][0-9]{0,8}$/.test(text)) return 'malformed';
  const n = Number(text);
  if (n === IDENTITY_VERSION) return 'supported';
  return n > IDENTITY_VERSION ? 'forward' : 'malformed';
}

const NODE_ID_RE = /^[0-9a-f]{64}$/i;
const MATRIX_USER_ID_RE = /^@[^:\s]+:[^\s]+$/;

/**
 * The one predicate for "this is a mesh node id as this build knows it": the
 * node's ed25519 public key as 64 hex characters (ADR 0008). Every other
 * copy of that regex in the repository delegates here, so a future shape is
 * admitted in one edit, deliberately, and not by accident in one parser.
 */
export function isNeutrinoServerName(value: string): boolean {
  return NODE_ID_RE.test(value);
}

/**
 * The canonical (lowercase) spelling of a node id — what Neutrino itself
 * uses as a server name and what deployment config must therefore contain.
 */
export function isCanonicalNodeId(value: string): boolean {
  return isNeutrinoServerName(value) && value === value.toLowerCase();
}

/** True for a classic or mesh Matrix user id by shape (`@localpart:server`). */
export function isMatrixUserIdShape(value: string): boolean {
  return MATRIX_USER_ID_RE.test(value);
}

/** What a mesh identity string turned out to be. */
export type MeshIdentityShape =
  /** A v1 node id, normalised to lowercase. */
  | { kind: 'node-id'; nodeId: string }
  /** Something this build does not recognise. Keep it; never route on it. */
  | { kind: 'unknown'; raw: string };

export function classifyMeshIdentity(raw: string | null | undefined): MeshIdentityShape | null {
  const value = raw?.trim();
  if (!value) return null;
  if (isNeutrinoServerName(value)) return { kind: 'node-id', nodeId: value.toLowerCase() };
  return { kind: 'unknown', raw: value };
}

/** The identity fields as a reader finds them, before any decision. */
export interface RawIdentityFields {
  /** Declared identity version; absent on cards written before versioning. */
  version?: string | number | null;
  /** The mesh field as written (`X-INDIAFOSS-MESH`, `neutrino_server_name`, …). */
  mesh?: string | null;
  /** The Matrix field as written (`X-INDIAFOSS-MATRIX`, `matrix_id`, …). */
  matrix?: string | null;
  /** Fields an earlier reader already set aside; carried forward untouched. */
  retained?: Record<string, string> | null;
}

/**
 * The persisted form: what a record keeps beside its routable fields so an
 * export can say which version it was written under and carry forward
 * anything this build could not read.
 */
export interface IdentityMeta {
  version: number;
  /**
   * Identity fields kept verbatim because this build did not understand them
   * (`mesh`, `matrix`, and `version` when that was the reason). Never an
   * address; never merged over a known identity.
   */
  retained?: Record<string, string>;
}

export interface IdentityEnvelope extends IdentityMeta {
  /** False when the declared version is not one this build reads. */
  understood: boolean;
  /** Promoted only when understood and well-formed. */
  meshNodeId?: string;
  matrixId?: string;
}

function clean(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

/**
 * The single decision every parser defers to. Given the raw fields, decide
 * what may be promoted to a routable identity and what is merely retained.
 *
 * - An unversioned or `1` card: a 64-hex mesh id and a `@user:server` Matrix
 *   id are promoted; a mesh or Matrix value of any other shape is retained.
 * - A newer or malformed version: nothing is promoted, everything is retained
 *   together with the version that caused it.
 * - Anything already in `retained` stays there, so a record round-trips
 *   through as many readers as it meets without losing a field.
 */
export function readIdentity(raw: RawIdentityFields): IdentityEnvelope {
  const compatibility = identityCompatibility(raw.version);
  const retained: Record<string, string> = { ...(raw.retained ?? {}) };
  const mesh = clean(raw.mesh);
  const matrix = clean(raw.matrix);

  if (compatibility === 'forward' || compatibility === 'malformed') {
    const declared = String(raw.version).trim();
    retained.version = declared;
    if (mesh) retained.mesh = mesh;
    if (matrix) retained.matrix = matrix;
    const parsed = compatibility === 'forward' ? Number(declared) : 0;
    return { version: parsed, understood: false, retained };
  }

  const envelope: IdentityEnvelope = { version: IDENTITY_VERSION, understood: true };
  const shape = classifyMeshIdentity(mesh);
  if (shape?.kind === 'node-id') envelope.meshNodeId = shape.nodeId;
  else if (shape) retained.mesh = shape.raw;
  if (matrix) {
    if (isMatrixUserIdShape(matrix)) envelope.matrixId = matrix;
    else retained.matrix = matrix;
  }
  if (Object.keys(retained).length > 0) envelope.retained = retained;
  return envelope;
}

/** The persisted part of an envelope, or nothing when there is nothing to persist. */
export function identityMetaOf(envelope: IdentityEnvelope): IdentityMeta {
  return envelope.retained
    ? { version: envelope.version, retained: envelope.retained }
    : {
        version: envelope.version,
      };
}

/** True when the record carries an identity this build set aside rather than read. */
export function hasRetainedIdentity(meta: IdentityMeta | undefined): boolean {
  if (!meta?.retained) return false;
  return 'mesh' in meta.retained || 'matrix' in meta.retained || 'version' in meta.retained;
}

/** The fields a stored record or export entry keeps for its identity. */
export interface IdentityBearing {
  matrixId?: string;
  neutrinoServerName?: string;
  identity?: IdentityMeta;
}

/**
 * Bring a stored or imported record's identity fields under the envelope.
 * A record from an older build has no `identity` and is read as v1; a record
 * whose fields this build does not recognise has them moved into
 * `identity.retained` and its routable slots cleared. Idempotent, so it is
 * safe to apply on every read.
 */
export function withIdentityEnvelope<T extends IdentityBearing>(record: T): T {
  const envelope = readIdentity({
    version: record.identity?.version,
    mesh: record.neutrinoServerName,
    matrix: record.matrixId,
    retained: record.identity?.retained,
  });
  const next: T = { ...record, identity: identityMetaOf(envelope) };
  if (envelope.meshNodeId) next.neutrinoServerName = envelope.meshNodeId;
  else delete next.neutrinoServerName;
  if (envelope.matrixId) next.matrixId = envelope.matrixId;
  else delete next.matrixId;
  return next;
}

/**
 * Merge a freshly received identity over a saved one. A saved routable field
 * is only ever replaced by a value this build understands: when the new card
 * carried that field in a shape it had to set aside (an unknown mesh shape, a
 * newer version), the saved value stays and the retained copy rides along.
 * The attendee neither loses a working address nor gains an unverifiable one.
 */
export function mergeIdentity<T extends IdentityBearing>(previous: T, draft: T): T {
  const merged: T = { ...draft };
  const retained = { ...(previous.identity?.retained ?? {}), ...(draft.identity?.retained ?? {}) };
  const unread = (field: 'mesh' | 'matrix'): boolean =>
    field in (draft.identity?.retained ?? {}) || 'version' in (draft.identity?.retained ?? {});
  if (!draft.neutrinoServerName && unread('mesh') && previous.neutrinoServerName) {
    merged.neutrinoServerName = previous.neutrinoServerName;
  }
  if (!draft.matrixId && unread('matrix') && previous.matrixId) merged.matrixId = previous.matrixId;
  const version =
    merged.neutrinoServerName || merged.matrixId
      ? IDENTITY_VERSION
      : (draft.identity?.version ?? previous.identity?.version ?? IDENTITY_VERSION);
  merged.identity = {
    version,
    ...(Object.keys(retained).length > 0 ? { retained } : {}),
  };
  return merged;
}
