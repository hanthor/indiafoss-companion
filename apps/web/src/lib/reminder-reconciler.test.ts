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
  it('keeps due deliveries armed while a clock refresh loads and adds only new alerts', async () => {
    const r = rig(),
      controller = new ReminderReconciler();
    const scheduled: string[] = [];
    const schedule = r.transport.schedule;
    r.transport.schedule = async (n) => {
      scheduled.push(n.id);
      await schedule(n);
    };
    await controller.replace(async () => r.batch(r.note('due'), r.note('future')));
    const loading = deferred<ReminderBatch>();
    const refreshing = controller.refresh(() => loading.promise);
    await Promise.resolve();
    expect([...r.active.keys()]).toEqual(['due', 'future']);
    // The due alert has aged out of the computed future window, but its
    // timer/browser delivery must finish instead of being cancelled.
    loading.resolve(r.batch(r.note('future'), r.note('new-window')));
    await refreshing;
    expect([...r.active.keys()]).toEqual(['due', 'future', 'new-window']);
    expect(scheduled).toEqual(['due', 'future', 'new-window']);
  });
  it('does not let a delayed clock refresh restore alerts after a plan edit', async () => {
    const r = rig(),
      controller = new ReminderReconciler();
    await controller.replace(async () => r.batch(r.note('removed')));
    const loading = deferred<ReminderBatch>();
    const refreshing = controller.refresh(() => loading.promise);
    await controller.replace(async () => r.batch(r.note('replacement')));
    loading.resolve(r.batch(r.note('removed')));
    await refreshing;
    expect([...r.active.keys()]).toEqual(['replacement']);
  });
});
