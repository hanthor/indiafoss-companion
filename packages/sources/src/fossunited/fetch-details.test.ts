import { describe, expect, it, vi } from 'vitest';
import { FossUnitedSource } from './index.js';
import type { FosuProposal, FosuSchedule } from './types.js';

const page = `
  <h1>Sample talk</h1>
  <fieldset>
    <legend>Session Description</legend>
    <div class="v3-html-content"><p>Learn how to ship FOSS.</p></div>
  </fieldset>
`;

function envelope(value: unknown): Response {
  return new Response(JSON.stringify({ message: value }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(pageImpl: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const schedule: FosuSchedule = {
    'Hall 1': {
      slot: [
        {
          name: 'session-1',
          scheduled_date: '2026-09-26',
          start_time: '10:00:00',
          end_time: '10:30:00',
          linked_cfp: 'p1',
        },
      ],
    },
  };
  const proposals: FosuProposal[] = [{ name: 'p1', route: '/c/indiafoss/2026/cfp/p1' }];
  const fetchImpl = vi.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith('/api/method/fossunited.api.dashboard.get_event')) return envelope({ name: 'EVT' });
    if (url.endsWith('/api/method/fossunited.api.schedule.get_event_schedule')) return envelope(schedule);
    if (url.endsWith('/api/method/fossunited.api.proposal.get_event_proposals'))
      return envelope({ proposals });
    return pageImpl(url);
  });
  return { calls, fetchImpl };
}

describe('proposal detail retries', () => {
  it('recovers when the first page read fails transiently', async () => {
    let attempts = 0;
    const { calls, fetchImpl } = stubFetch(() => {
      attempts += 1;
      if (attempts === 1) return new Response('boom', { status: 500 });
      return new Response(page, { headers: { 'Content-Type': 'text/html' } });
    });
    const source = new FossUnitedSource(fetchImpl, 'https://fossunited.org');
    const captured = await source.fetchEvent({ id: 'e', locator: 'c/e/2026' });
    expect(captured.kind).toBe('fossunited');
    if (captured.kind !== 'fossunited') throw new Error('unreachable');
    expect(captured.proposalDetails['p1']?.description).toContain('Learn how to ship FOSS.');
    expect(calls.filter((url) => url.endsWith('/c/indiafoss/2026/cfp/p1'))).toHaveLength(2);
  });

  it('still gives up on a persistently unreadable page', async () => {
    const { calls, fetchImpl } = stubFetch(
      () => new Response('down', { status: 503 }),
    );
    const source = new FossUnitedSource(fetchImpl, 'https://fossunited.org');
    const captured = await source.fetchEvent({ id: 'e', locator: 'c/e/2026' });
    if (captured.kind !== 'fossunited') throw new Error('unreachable');
    expect(captured.proposalDetails).toEqual({});
    expect(calls.filter((url) => url.endsWith('/c/indiafoss/2026/cfp/p1'))).toHaveLength(3);
  });
});
