import { isMatrixRoomAlias, isMatrixRoomId, isMatrixUserId } from '@indiafoss/model';

export type MatrixTargetKind = 'user' | 'alias' | 'room';

export interface MatrixTarget {
  kind: MatrixTargetKind;
  id: string;
}

function classify(id: string): MatrixTarget | null {
  if (isMatrixUserId(id)) return { kind: 'user', id };
  if (isMatrixRoomAlias(id)) return { kind: 'alias', id };
  if (isMatrixRoomId(id)) return { kind: 'room', id };
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parse anything an attendee may scan or paste into a Matrix target:
 * raw ids (`@a:b`, `#r:b`, `!id:b`), `matrix.to` permalinks, `matrix:` URIs
 * (MSC2312) and the app's own `indiafoss://chat?dm=…|join=…` payloads.
 * Returns `null` for unsupported or malformed input; never throws.
 */
export function parseMatrixTarget(input: string): MatrixTarget | null {
  const raw = input.trim();
  if (!raw || raw.length > 512) return null;

  const direct = classify(raw);
  if (direct) return direct;

  // matrix.to permalinks: https://matrix.to/#/@user:server or /#/%23alias%3Aserver
  const matrixTo = raw.match(/^https?:\/\/matrix\.to\/#\/([^?]+)/i);
  if (matrixTo?.[1]) return classify(safeDecode(matrixTo[1]));

  // matrix: URIs — matrix:u/alice:example.org, matrix:r/room:example.org, matrix:roomid/id:example.org
  const uri = raw.match(/^matrix:(u|r|roomid)\/([^?#]+)/i);
  if (uri?.[1] && uri[2]) {
    const prefix = { u: '@', r: '#', roomid: '!' }[uri[1].toLowerCase()] ?? '';
    return classify(prefix + safeDecode(uri[2]));
  }

  // Reserved app payloads used for QR handoff between the PWA and a Matrix client.
  const own = raw.match(/^indiafoss:\/\/chat\/?\?(.+)$/i);
  if (own?.[1]) {
    const params = new URLSearchParams(own[1]);
    const dm = params.get('dm');
    if (dm) return isMatrixUserId(dm) ? { kind: 'user', id: dm } : null;
    const join = params.get('join');
    if (join) return classify(join);
  }
  return null;
}

/** Permalink understood by Element and every other Matrix client. */
export function matrixToUrl(id: string): string {
  return `https://matrix.to/#/${encodeURIComponent(id)}`;
}

/** `matrix:` URI (MSC2312) for native handoff to an installed client. */
export function matrixUri(target: MatrixTarget): string {
  const body = encodeURIComponent(target.id.slice(1));
  switch (target.kind) {
    case 'user':
      return `matrix:u/${body}?action=chat`;
    case 'alias':
      return `matrix:r/${body}?action=join`;
    case 'room':
      return `matrix:roomid/${body}?action=join`;
  }
}

/** App-native deep link that the QR scanner recognises. */
export function companionChatLink(target: MatrixTarget): string {
  const params = new URLSearchParams();
  params.set(target.kind === 'user' ? 'dm' : 'join', target.id);
  return `indiafoss://chat?${params.toString()}`;
}

/** Local part of an id for compact display (`@alice:example.org` → `alice`). */
export function localpart(id: string): string {
  const match = id.match(/^[@#!]([^:]+):/);
  return match?.[1] ?? id;
}
