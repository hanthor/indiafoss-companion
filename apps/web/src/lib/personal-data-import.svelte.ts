import {
  CompanionStorage,
  type ImportChange,
  type PersonalDataImportPreview,
} from '@indiafoss/storage';
import { reloadPreferences } from './prefs.svelte';
import { reloadPlanEdits } from './planEdits.svelte';
import { reloadRoomPrefs } from './roomPrefs.svelte';
import { reloadProfile } from './profile.svelte';
import { forgetPlanned } from './planned.svelte';
import { invalidatePlanProjection } from './resolved-plan.svelte';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

export function previewPersonalDataImport(raw: string): Promise<PersonalDataImportPreview> {
  return getStorage().previewPersonalDataImport(raw);
}

/**
 * Commit the selected changes, then bring every reactive cache back in line
 * with storage and invalidate the plan projection so screens and reminders
 * never keep running on pre-import data. Changes may come from reactive
 * state, so they are snapshotted before IndexedDB structured-clones them.
 */
export async function applyPersonalDataImport(
  changes: ImportChange[],
): Promise<{ applied: number; refreshed: boolean }> {
  const { applied } = await getStorage().applyPersonalDataImport($state.snapshot(changes));
  try {
    await refreshAfterImport();
    return { applied, refreshed: true };
  } catch {
    return { applied, refreshed: false };
  }
}

export async function refreshAfterImport(): Promise<void> {
  await Promise.all([reloadPreferences(), reloadPlanEdits(), reloadRoomPrefs(), reloadProfile()]);
  forgetPlanned();
  invalidatePlanProjection();
}
