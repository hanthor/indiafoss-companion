/**
 * Shared helpers for the cross-boundary contract validators.
 *
 * Every contract in this directory is parsed from something we did not write:
 * an HTTPS response, a QR code, another person's phone. The validators
 * therefore take `unknown` and narrow, rather than trusting a declared type.
 *
 * See ADR 0009 for why these are hand-written rather than schema-generated.
 */

/**
 * Compatibility outcome for a `schemaVersion` field.
 *
 * - `supported` — this exact major version is understood.
 * - `forward` — a newer major version. The value must be rejected, and the
 *   caller must keep whatever it already had. Never discard a good value to
 *   store one you cannot read.
 * - `unsupported` — older than anything still readable, or not an integer.
 */
export type SchemaCompatibility = 'supported' | 'forward' | 'unsupported';

/** Classify a candidate `schemaVersion` against the version we implement. */
export function schemaCompatibility(value: unknown, supported: number): SchemaCompatibility {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return 'unsupported';
  if (value === supported) return 'supported';
  return value > supported ? 'forward' : 'unsupported';
}

/** True for a plain JSON object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Collect issues for a required non-empty string at `field`.
 *
 * `path` prefixes the message so nested contracts report where the problem is.
 */
export function requireString(record: Record<string, unknown>, field: string, path = ''): string[] {
  const value = record[field];
  const at = `${path}${field}`;
  if (typeof value !== 'string') return [`${at} must be a string`];
  if (!value.trim()) return [`${at} must be a non-empty string`];
  return [];
}

/** Like {@link requireString}, but the field may be absent or undefined. */
export function optionalString(
  record: Record<string, unknown>,
  field: string,
  path = '',
): string[] {
  if (record[field] === undefined) return [];
  return requireString(record, field, path);
}

/** Collect issues for a required ISO-8601 instant at `field`. */
export function requireInstant(
  record: Record<string, unknown>,
  field: string,
  path = '',
): string[] {
  const issues = requireString(record, field, path);
  if (issues.length > 0) return issues;
  const value = record[field] as string;
  if (Number.isNaN(Date.parse(value))) {
    return [`${path}${field} must be an ISO-8601 timestamp, got ${JSON.stringify(value)}`];
  }
  return [];
}

/** Like {@link requireInstant}, but the field may be absent or undefined. */
export function optionalInstant(
  record: Record<string, unknown>,
  field: string,
  path = '',
): string[] {
  if (record[field] === undefined) return [];
  return requireInstant(record, field, path);
}

/** Collect issues for a required value drawn from a fixed set of strings. */
export function requireLiteral(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
  path = '',
): string[] {
  const value = record[field];
  const at = `${path}${field}`;
  if (typeof value !== 'string') return [`${at} must be a string`];
  if (!allowed.includes(value)) {
    return [`${at} must be one of ${allowed.join(', ')}; got ${JSON.stringify(value)}`];
  }
  return [];
}

/** Collect issues for a required array at `field`, optionally non-empty. */
export function requireArray(
  record: Record<string, unknown>,
  field: string,
  options: { nonEmpty?: boolean } = {},
  path = '',
): string[] {
  const value = record[field];
  const at = `${path}${field}`;
  if (!Array.isArray(value)) return [`${at} must be an array`];
  if (options.nonEmpty && value.length === 0) return [`${at} must not be empty`];
  return [];
}

/**
 * Collect duplicate-id issues across a list of already-extracted ids.
 *
 * Callers pass the label used in the message so the caller's vocabulary
 * ("session", "room", "route") survives into the issue text.
 */
export function collectDuplicates(ids: readonly string[], label: string): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) issues.push(`duplicate ${label} id: ${id}`);
    seen.add(id);
  }
  return issues;
}

/**
 * Collect issues for the `schemaVersion` field common to every contract.
 *
 * A `forward` version produces an issue naming both versions, so a caller
 * logging the issue can tell "too new to read" apart from "malformed".
 */
export function collectSchemaVersionIssues(
  record: Record<string, unknown>,
  supported: number,
  contract: string,
): string[] {
  const compatibility = schemaCompatibility(record.schemaVersion, supported);
  if (compatibility === 'supported') return [];
  if (compatibility === 'forward') {
    return [
      `${contract} schemaVersion ${String(record.schemaVersion)} is newer than the supported version ${supported}; keep the previous value`,
    ];
  }
  return [
    `${contract} schemaVersion must be the integer ${supported}, got ${JSON.stringify(record.schemaVersion)}`,
  ];
}

/** A lowercase 64-character hex string — the shape of an iroh node id. */
export function isHex64(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/**
 * True for a Matrix user id of either flavour: a classic `@localpart:server`
 * or a mesh `@n:<64-hex>` (ADR 0008 — the node's public key is the server
 * name). Shape only; this says nothing about whether the id exists or is
 * controlled by whoever presented it.
 */
export function isMatrixUserId(value: unknown): boolean {
  if (typeof value !== 'string' || !value.startsWith('@')) return false;
  const colon = value.indexOf(':');
  if (colon < 2 || colon === value.length - 1) return false;
  return true;
}

/** True for a Matrix room alias, `#localpart:server`. */
export function isMatrixRoomAlias(value: unknown): boolean {
  if (typeof value !== 'string' || !value.startsWith('#')) return false;
  const colon = value.indexOf(':');
  return colon >= 2 && colon !== value.length - 1;
}

/** True for a Matrix room id, `!opaque:server`. */
export function isMatrixRoomId(value: unknown): boolean {
  if (typeof value !== 'string' || !value.startsWith('!')) return false;
  const colon = value.indexOf(':');
  return colon >= 2 && colon !== value.length - 1;
}
