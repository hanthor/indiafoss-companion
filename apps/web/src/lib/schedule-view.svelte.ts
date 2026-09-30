/**
 * The Schedule view the attendee last had open, remembered on this device,
 * so the Schedule tab brings them back to it.
 */
export type ScheduleView = 'timeline' | 'rooms' | 'agenda';

const STORAGE_KEY = 'indiafoss.scheduleView';

function stored(): ScheduleView {
  try {
    const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    return value === 'rooms' || value === 'agenda' ? value : 'timeline';
  } catch {
    return 'timeline';
  }
}

export const scheduleView = $state<{ last: ScheduleView }>({ last: stored() });

export function rememberScheduleView(view: ScheduleView): void {
  if (scheduleView.last === view) return;
  scheduleView.last = view;
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Storage may be refused (private window); the tab still follows this visit.
  }
}
