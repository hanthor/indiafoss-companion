import { isMatrixUserId, isNeutrinoServerName } from '@indiafoss/model';

/**
 * What IndiaFOSS Chat hands back for the attendee's own card. Chat's "My
 * code" sheet opens the Companion at `/connect?mesh=<node id>` (a mesh
 * session) or `/connect?matrix=<@user:server>` (an internet account), so the
 * id never has to be read off one screen and typed into another. Nothing is
 * written until the attendee confirms on the card; the values are only ever
 * the public addresses the card would carry anyway.
 */
export interface IdentityHandback {
  neutrinoServerName?: string;
  matrixId?: string;
}

/** The hand-back carried by a `/connect` URL, or null when it carries none that is valid. */
export function parseIdentityHandback(params: URLSearchParams): IdentityHandback | null {
  const result: IdentityHandback = {};
  const mesh = params.get('mesh')?.trim().toLowerCase();
  if (mesh && isNeutrinoServerName(mesh)) result.neutrinoServerName = mesh;
  const matrix = params.get('matrix')?.trim();
  if (matrix && isMatrixUserId(matrix)) result.matrixId = matrix;
  return result.neutrinoServerName || result.matrixId ? result : null;
}

/** The Companion path Chat opens; exported so the two ends cannot drift apart in tests. */
export function identityHandbackPath(handback: IdentityHandback): string {
  const params = new URLSearchParams();
  if (handback.neutrinoServerName) params.set('mesh', handback.neutrinoServerName);
  if (handback.matrixId) params.set('matrix', handback.matrixId);
  return `/connect?${params.toString()}`;
}
