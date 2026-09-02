import { describe, expect, it } from 'vitest';
import { applySyncResponse, deriveRoomName, describeEvent } from './sync.js';
import { slidingSyncToSyncResponse } from './http.js';
import type { MatrixRoomRecord, SyncResponse } from './types.js';

const ME = '@me:x.org';

function response(overrides: Partial<SyncResponse> = {}): SyncResponse {
  return { next_batch: 's1', ...overrides };
}

describe('applySyncResponse', () => {
  it('builds a room from state and timeline, counts unread from others', () => {
    const delta = applySyncResponse(
      new Map(),
      response({
        rooms: {
          join: {
            '!r:x.org': {
              state: {
                events: [
                  { type: 'm.room.name', content: { name: 'Hallway' } },
                  { type: 'm.room.canonical_alias', content: { alias: '#hallway:x.org' } },
                  { type: 'm.room.member', state_key: ME, content: { membership: 'join' } },
                  {
                    type: 'm.room.member',
                    state_key: '@bob:x.org',
                    content: { membership: 'join', displayname: 'Bob' },
                  },
                ],
              },
              timeline: {
                limited: true,
                prev_batch: 'p1',
                events: [
                  {
                    event_id: '$1',
                    type: 'm.room.message',
                    sender: '@bob:x.org',
                    origin_server_ts: 20,
                    content: { msgtype: 'm.text', body: 'hi' },
                  },
                  {
                    event_id: '$2',
                    type: 'm.room.message',
                    sender: ME,
                    origin_server_ts: 10,
                    content: { msgtype: 'm.text', body: 'hello' },
                    unsigned: { transaction_id: 'txn-1' },
                  },
                  {
                    event_id: '$3',
                    type: 'm.reaction',
                    sender: '@bob:x.org',
                    origin_server_ts: 30,
                  },
                ],
              },
            },
          },
        },
      }),
      ME,
    );
    expect(delta.nextBatch).toBe('s1');
    expect(delta.rooms).toHaveLength(1);
    const room = delta.rooms[0]!;
    expect(room).toMatchObject({
      roomId: '!r:x.org',
      name: 'Hallway',
      alias: '#hallway:x.org',
      memberIds: [ME, '@bob:x.org'],
      memberNames: { '@bob:x.org': 'Bob' },
      membership: 'join',
      lastActivityTs: 20,
      unread: 1,
      prevBatch: 'p1',
    });
    expect(delta.events.map((e) => e.eventId)).toEqual(['$2', '$1']);
    expect(delta.events[0]!.txnId).toBe('txn-1');
  });

  it('prefers server notification counts, marks DMs and handles invites and leaves', () => {
    const known = new Map<string, MatrixRoomRecord>([
      [
        '!old:x.org',
        {
          roomId: '!old:x.org',
          name: 'Old',
          isDirect: false,
          memberIds: [],
          memberNames: {},
          encrypted: false,
          membership: 'join',
          lastActivityTs: 5,
          unread: 3,
        },
      ],
    ]);
    const delta = applySyncResponse(
      known,
      response({
        account_data: {
          events: [{ type: 'm.direct', content: { '@bob:x.org': ['!dm:x.org'] } }],
        },
        rooms: {
          join: {
            '!dm:x.org': {
              timeline: { events: [{ type: 'm.room.encryption', state_key: '', content: {} }] },
              unread_notifications: { notification_count: 7 },
            },
          },
          invite: {
            '!inv:x.org': {
              invite_state: {
                events: [{ type: 'm.room.name', content: { name: 'Devroom chat' } }],
              },
            },
          },
          leave: { '!old:x.org': {} },
        },
      }),
      ME,
    );
    expect(delta.directMap).toEqual({ '@bob:x.org': ['!dm:x.org'] });
    const dm = delta.rooms.find((r) => r.roomId === '!dm:x.org')!;
    expect(dm.isDirect).toBe(true);
    expect(dm.encrypted).toBe(true);
    expect(dm.unread).toBe(7);
    const invite = delta.rooms.find((r) => r.roomId === '!inv:x.org')!;
    expect(invite.membership).toBe('invite');
    expect(invite.name).toBe('Devroom chat');
    expect(delta.leftRoomIds).toEqual(['!old:x.org']);
    expect(known.get('!old:x.org')!.unread).toBe(3); // input untouched
  });
});

describe('deriveRoomName', () => {
  const base: MatrixRoomRecord = {
    roomId: '!r:x',
    name: '',
    isDirect: true,
    memberIds: [ME, '@bob:x', '@carol:x'],
    memberNames: { '@bob:x': 'Bob' },
    encrypted: false,
    membership: 'join',
    lastActivityTs: 0,
    unread: 0,
  };
  it('falls back from name to alias to members', () => {
    expect(deriveRoomName({ ...base, name: 'Named' }, ME)).toBe('Named');
    expect(deriveRoomName({ ...base, alias: '#a:x' }, ME)).toBe('#a:x');
    expect(deriveRoomName(base, ME)).toBe('Bob, @carol:x');
    expect(deriveRoomName({ ...base, memberIds: [ME] }, ME)).toBe('Empty room');
  });
});

describe('describeEvent', () => {
  it('renders text, media placeholders and encrypted events', () => {
    expect(
      describeEvent({ type: 'm.room.message', content: { msgtype: 'm.text', body: 'x' } }),
    ).toEqual({
      body: 'x',
      msgtype: 'm.text',
    });
    expect(
      describeEvent({
        type: 'm.room.message',
        content: {
          msgtype: 'm.image',
          body: 'cat.png',
          url: 'mxc://x/1',
          info: { mimetype: 'image/png' },
        },
      }),
    ).toMatchObject({
      body: 'cat.png',
      msgtype: 'm.image',
      mediaUrl: 'mxc://x/1',
      mediaMime: 'image/png',
    });
    expect(describeEvent({ type: 'm.room.encrypted' })!.msgtype).toBe('m.encrypted');
    expect(describeEvent({ type: 'm.room.member' })).toBeNull();
    expect(
      describeEvent({ type: 'm.room.message', content: { msgtype: 'm.text', body: '' } }),
    ).toBeNull();
  });
});

describe('replies and reactions', () => {
  it('carries a reply relation and strips the quoted fallback body', () => {
    const described = describeEvent({
      type: 'm.room.message',
      event_id: '$reply',
      sender: '@a:x',
      origin_server_ts: 1,
      content: {
        msgtype: 'm.text',
        body: '> <@b:x> original\n\nagreed',
        'm.relates_to': { 'm.in_reply_to': { event_id: '$original' } },
      },
    });
    expect(described).toEqual({ body: 'agreed', msgtype: 'm.text', replyTo: '$original' });
  });

  it('describes a reaction as its annotation key', () => {
    expect(
      describeEvent({
        type: 'm.reaction',
        event_id: '$r',
        sender: '@a:x',
        origin_server_ts: 1,
        content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$msg', key: '🎉' } },
      }),
    ).toEqual({ body: '🎉', msgtype: 'm.reaction', reactsTo: '$msg', reactionKey: '🎉' });
    expect(
      describeEvent({
        type: 'm.reaction',
        event_id: '$r',
        sender: '@a:x',
        origin_server_ts: 1,
        content: {},
      }),
    ).toBeNull();
  });
});

describe('slidingSyncToSyncResponse (MSC4186)', () => {
  it('folds a sliding response into the /sync shape the session layer reads', () => {
    const folded = slidingSyncToSyncResponse({
      pos: 'p1',
      rooms: {
        '!joined:example.org': {
          name: 'Audi 1',
          initial: true,
          limited: true,
          prev_batch: 'b1',
          timeline: [{ type: 'm.room.message', content: { body: 'hi' } } as never],
          required_state: [{ type: 'm.room.name', content: { name: 'Audi 1' } } as never],
        },
        '!invited:example.org': {
          invite_state: [{ type: 'm.room.member', content: { membership: 'invite' } } as never],
        },
      },
      extensions: {
        to_device: { events: [{ type: 'm.room_key', content: {} } as never] },
        e2ee: {
          device_lists: { changed: ['@a:example.org'] },
          device_one_time_keys_count: { signed_curve25519: 12 },
        },
        account_data: { global: [{ type: 'm.direct', content: {} } as never] },
      },
    });

    expect(folded.next_batch).toBe('p1');
    expect(Object.keys(folded.rooms?.join ?? {})).toEqual(['!joined:example.org']);
    expect(folded.rooms?.join?.['!joined:example.org']?.timeline?.events).toHaveLength(1);
    expect(folded.rooms?.join?.['!joined:example.org']?.timeline?.limited).toBe(true);
    expect(folded.rooms?.join?.['!joined:example.org']?.timeline?.prev_batch).toBe('b1');
    expect(folded.rooms?.join?.['!joined:example.org']?.state?.events).toHaveLength(1);
    // An invited room must not be folded in as joined, or the app would show
    // an invitation as a room you are already in.
    expect(Object.keys(folded.rooms?.invite ?? {})).toEqual(['!invited:example.org']);
    expect(folded.to_device?.events).toHaveLength(1);
    expect(folded.device_lists?.changed).toEqual(['@a:example.org']);
    expect(folded.device_one_time_keys_count).toEqual({ signed_curve25519: 12 });
    expect(folded.account_data?.events).toHaveLength(1);
  });

  it('survives a response carrying nothing but a position', () => {
    const folded = slidingSyncToSyncResponse({ pos: 'p2' });
    expect(folded.next_batch).toBe('p2');
    expect(folded.rooms?.join).toEqual({});
    expect(folded.to_device).toBeUndefined();
  });
});
