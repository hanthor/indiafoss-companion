import type { MatrixEventRecord, MatrixRoomRecord, RawMatrixEvent, SyncResponse } from './types.js';

export interface SyncDelta {
  /** Rooms whose cached summary changed (create or update). */
  rooms: MatrixRoomRecord[];
  /** Rooms the user left or was kicked from. */
  leftRoomIds: string[];
  /** New or updated timeline events, oldest first. */
  events: MatrixEventRecord[];
  /** Latest `m.direct` map when the response carried one. */
  directMap?: Record<string, string[]>;
  /** Users currently typing, per room (ephemeral; only rooms mentioned in the response). */
  typing: Record<string, string[]>;
  /** Events an `m.room.redaction` in this response targets; cached copies must be blanked. */
  redactedIds: string[];
  nextBatch: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Room display name following the spec's fallback chain (name → alias → members). */
export function deriveRoomName(room: MatrixRoomRecord, selfUserId: string): string {
  if (room.name.trim()) return room.name;
  if (room.alias) return room.alias;
  const others = room.memberIds.filter((id) => id !== selfUserId);
  const names = others.map((id) => room.memberNames[id] ?? id);
  if (names.length === 0) return 'Empty room';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
}

function emptyRoom(roomId: string): MatrixRoomRecord {
  return {
    roomId,
    name: '',
    isDirect: false,
    memberIds: [],
    memberNames: {},
    encrypted: false,
    membership: 'join',
    lastActivityTs: 0,
    unread: 0,
  };
}

export interface DescribedEvent {
  body: string;
  msgtype?: string;
  mediaUrl?: string;
  mediaFile?: string;
  mediaMime?: string;
  mediaSize?: number;
  replyTo?: string;
  reactsTo?: string;
  reactionKey?: string;
}

/** `m.relates_to`: a reply target, or an annotation (reaction) target and key. */
export function relationOf(content: Record<string, unknown>): {
  replyTo?: string;
  reactsTo?: string;
  reactionKey?: string;
} {
  const rel = content['m.relates_to'] as
    | {
        rel_type?: string;
        event_id?: string;
        key?: string;
        'm.in_reply_to'?: { event_id?: string };
      }
    | undefined;
  if (!rel) return {};
  const replyTo = str(rel['m.in_reply_to']?.event_id);
  if (rel.rel_type === 'm.annotation' && rel.event_id) {
    return { reactsTo: rel.event_id, reactionKey: str(rel.key) ?? '👍' };
  }
  return replyTo ? { replyTo } : {};
}

const MEDIA_TYPES = new Set(['m.image', 'm.file', 'm.audio', 'm.video']);

/** Human-readable body for a timeline event, or `null` when it should be hidden. */
export function describeEvent(event: RawMatrixEvent): DescribedEvent | null {
  const content = event.content ?? {};
  switch (event.type) {
    case 'm.room.message': {
      const msgtype = str(content.msgtype) ?? 'm.text';
      // A rich reply repeats the quoted text as "> …" lines; strip them, the UI shows the quote.
      const rawBody = str(content.body) ?? '';
      const relation = relationOf(content);
      const body = relation.replyTo ? rawBody.replace(/^(> .*\n)+\n?/, '') : rawBody;
      if (msgtype === 'm.text' || msgtype === 'm.notice' || msgtype === 'm.emote') {
        return body ? { body, msgtype, ...relation } : null;
      }
      if (MEDIA_TYPES.has(msgtype)) {
        const file = content.file as { url?: string } | undefined;
        const info = (content.info ?? {}) as { mimetype?: string; size?: number };
        const mediaUrl = str(content.url) ?? str(file?.url);
        return {
          body: body || msgtype.slice(2),
          msgtype,
          mediaUrl,
          mediaFile: file ? JSON.stringify(file) : undefined,
          mediaMime: str(info.mimetype),
          mediaSize: typeof info.size === 'number' ? info.size : undefined,
        };
      }
      return { body: body || `[${msgtype}]`, msgtype };
    }
    case 'm.room.encrypted':
      return { body: '[Encrypted message — waiting for the key]', msgtype: 'm.encrypted' };
    case 'm.sticker':
      return { body: '[sticker]', msgtype: 'm.sticker' };
    case 'm.reaction': {
      const relation = relationOf(content);
      return relation.reactsTo
        ? { body: relation.reactionKey ?? '👍', msgtype: 'm.reaction', ...relation }
        : null;
    }
    default:
      return null;
  }
}

function applyStateEvent(room: MatrixRoomRecord, event: RawMatrixEvent): void {
  const content = event.content ?? {};
  switch (event.type) {
    case 'm.room.name':
      room.name = str(content.name) ?? '';
      break;
    case 'm.room.canonical_alias':
      room.alias = str(content.alias);
      break;
    case 'm.room.topic':
      room.topic = str(content.topic);
      break;
    case 'm.room.encryption':
      room.encrypted = true;
      break;
    case 'm.room.member': {
      const userId = event.state_key;
      if (!userId) break;
      const membership = str(content.membership);
      const displayName = str(content.displayname);
      if (membership === 'join' || membership === 'invite') {
        if (!room.memberIds.includes(userId)) room.memberIds = [...room.memberIds, userId];
        if (displayName) room.memberNames = { ...room.memberNames, [userId]: displayName };
      } else if (membership === 'leave' || membership === 'ban') {
        room.memberIds = room.memberIds.filter((id) => id !== userId);
      }
      break;
    }
  }
}

/**
 * The record a redacted event leaves behind: same identity and place in the
 * timeline, a placeholder body, and no relation — a redacted reaction must
 * stop counting, and a redacted reply must stop quoting.
 */
export function redactedRecord(roomId: string, event: RawMatrixEvent): MatrixEventRecord | null {
  if (!event.event_id || !event.sender) return null;
  const isReaction = event.type === 'm.reaction';
  return {
    eventId: event.event_id,
    roomId,
    sender: event.sender,
    ts: event.origin_server_ts ?? 0,
    type: event.type,
    body: isReaction ? '' : 'Message deleted',
    msgtype: isReaction ? 'm.reaction' : 'm.redacted',
    redacted: true,
  };
}

function toRecord(roomId: string, event: RawMatrixEvent): MatrixEventRecord | null {
  if (!event.event_id || !event.sender) return null;
  if (event.unsigned?.redacted_because) return redactedRecord(roomId, event);
  const described = describeEvent(event);
  if (!described) return null;
  const encrypted = event.unsigned?.encrypted === true || event.type === 'm.room.encrypted';
  return {
    eventId: event.event_id,
    roomId,
    sender: event.sender,
    ts: event.origin_server_ts ?? 0,
    type: event.type,
    body: described.body,
    msgtype: described.msgtype,
    txnId: event.unsigned?.transaction_id,
    ...(encrypted ? { encrypted: true } : {}),
    ...(event.type === 'm.room.encrypted' ? { undecryptable: true } : {}),
    ...(described.mediaUrl ? { mediaUrl: described.mediaUrl } : {}),
    ...(described.mediaFile ? { mediaFile: described.mediaFile } : {}),
    ...(described.mediaMime ? { mediaMime: described.mediaMime } : {}),
    ...(described.mediaSize !== undefined ? { mediaSize: described.mediaSize } : {}),
    ...(described.replyTo ? { replyTo: described.replyTo } : {}),
    ...(described.reactsTo ? { reactsTo: described.reactsTo } : {}),
    ...(described.reactionKey ? { reactionKey: described.reactionKey } : {}),
  };
}

/** Exported for the session manager's decrypt-and-replace path. */
export const eventToRecord = toRecord;

/**
 * Pure reducer: fold one `/sync` response into the cached room summaries.
 * `known` is not mutated; changed rooms are returned in the delta. Unread
 * counts prefer the server's `notification_count` (kept in step with read
 * receipts across devices) and fall back to counting others' messages.
 */
export function applySyncResponse(
  known: ReadonlyMap<string, MatrixRoomRecord>,
  response: SyncResponse,
  selfUserId: string,
  directMap: Record<string, string[]> = {},
): SyncDelta {
  const delta: SyncDelta = {
    rooms: [],
    leftRoomIds: [],
    events: [],
    typing: {},
    redactedIds: [],
    nextBatch: response.next_batch,
  };

  for (const accountEvent of response.account_data?.events ?? []) {
    if (accountEvent.type === 'm.direct' && accountEvent.content) {
      delta.directMap = accountEvent.content as Record<string, string[]>;
      directMap = delta.directMap;
    }
  }
  const directRoomIds = new Set(Object.values(directMap).flat());

  for (const [roomId, joined] of Object.entries(response.rooms?.join ?? {})) {
    const previous = known.get(roomId);
    const room: MatrixRoomRecord = previous
      ? {
          ...previous,
          memberIds: [...previous.memberIds],
          memberNames: { ...previous.memberNames },
        }
      : emptyRoom(roomId);
    room.membership = 'join';

    for (const event of joined.state?.events ?? []) applyStateEvent(room, event);
    const timeline = joined.timeline?.events ?? [];
    let newFromOthers = 0;
    for (const event of timeline) {
      if (event.state_key !== undefined) applyStateEvent(room, event);
      if (event.type === 'm.room.redaction') {
        const target = str(event.content?.redacts);
        if (target) delta.redactedIds.push(target);
        continue;
      }
      const record = toRecord(roomId, event);
      if (!record) continue;
      delta.events.push(record);
      if (record.ts > room.lastActivityTs) room.lastActivityTs = record.ts;
      if (record.sender !== selfUserId) newFromOthers += 1;
    }
    if (!previous || joined.timeline?.limited) {
      room.prevBatch = joined.timeline?.prev_batch ?? room.prevBatch;
    }
    for (const ephemeral of joined.ephemeral?.events ?? []) {
      if (ephemeral.type === 'm.typing') {
        const ids = (ephemeral.content?.user_ids as unknown[] | undefined) ?? [];
        delta.typing[roomId] = ids.filter((id): id is string => typeof id === 'string');
      }
    }
    const serverUnread = joined.unread_notifications?.notification_count;
    room.unread = serverUnread ?? room.unread + newFromOthers;
    room.isDirect = directRoomIds.has(roomId) || room.isDirect;
    room.name = room.name.trim() ? room.name : '';
    delta.rooms.push(room);
  }

  for (const [roomId, invited] of Object.entries(response.rooms?.invite ?? {})) {
    const room = known.get(roomId) ? { ...known.get(roomId)! } : emptyRoom(roomId);
    room.membership = 'invite';
    for (const event of invited.invite_state?.events ?? []) applyStateEvent(room, event);
    room.isDirect = directRoomIds.has(roomId) || room.isDirect;
    delta.rooms.push(room);
  }

  for (const roomId of Object.keys(response.rooms?.leave ?? {})) {
    delta.leftRoomIds.push(roomId);
  }

  delta.events.sort((a, b) => a.ts - b.ts);
  return delta;
}
