import { describe, expect, it } from 'vitest';
import { ReminderReconciler, type ReminderBatch } from './reminder-reconciler';
import type { AppNotification, NotificationTransport } from './notifications';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function rig() {
  const active = new Map<string, AppNotification>();
  const transport: NotificationTransport = {
    permission: async () => 'granted',
    requestPermission: async () => true,
    cancel: async (id) => {
      active.delete(id);
    },
    schedule: async (n) => {
      active.set(n.id, n);
    },
  };
  const note = (id: string, title = id): AppNotification => ({
    id,
    title,
    body: '',
    at: '2026-09-26T10:00:00+05:30',
  });
  const batch = (...notes: AppNotification[]): ReminderBatch => ({
    transport,
    notifications: notes,
  });
  return { active, transport, note, batch };
}

describe('ReminderReconciler', () => {
  it('cancels removed alerts and replaces changed details under the same ID', async () => {
    const r = rig(),
      controller = new ReminderReconciler();
    await controller.replace(async () => r.batch(r.note('removed'), r.note('moved', 'Hall 1')));
    await controller.replace(async () => r.batch(r.note('moved', 'Hall 2')));
    expect([...r.active.keys()]).toEqual(['moved']);
    expect(r.active.get('moved')?.title).toBe('Hall 2');
  });
  it('does not restore an older plan that finishes after a newer plan', async () => {
    const r = rig(),
      controller = new ReminderReconciler(),
      old = deferred<ReminderBatch>();
    const pending = controller.replace(() => old.promise);
    await controller.replace(async () => r.batch(r.note('new')));
    old.resolve(r.batch(r.note('old')));
    await pending;
    expect([...r.active.keys()]).toEqual(['new']);
  });
  it('cancels even a transport write already in progress when disabled', async () => {
    const r = rig(),
      controller = new ReminderReconciler(),
      entered = deferred<void>(),
      finish = deferred<void>();
    r.transport.schedule = async (n) => {
      entered.resolve();
      await finish.promise;
      r.active.set(n.id, n);
    };
    const pending = controller.replace(async () => r.batch(r.note('old')));
    await entered.promise;
    const clearing = controller.clear();
    finish.resolve();
    await Promise.all([pending, clearing]);
    expect(r.active.size).toBe(0);
  });
  it('clears stale timers while loading, and leaves them cleared when resolution fails', async () => {
    const r = rig(),
      controller = new ReminderReconciler();
    await controller.replace(async () => r.batch(r.note('old')));
    await expect(
      controller.replace(async () => {
        throw new Error('bad plan');
      }),
    ).rejects.toThrow('bad plan');
    expect(r.active.size).toBe(0);
  });
});
