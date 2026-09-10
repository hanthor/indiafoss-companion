<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import {
    PersonalDataImportStaleError,
    type ImportChange,
    type ImportSkip,
    type PersonalDataImportPreview,
  } from '@indiafoss/storage';
  import {
    applyPersonalDataImport,
    previewPersonalDataImport,
  } from '$lib/personal-data-import.svelte';

  let busy = $state(false);
  let preview = $state<PersonalDataImportPreview | null>(null);
  let fileName = $state('');
  let status = $state('');
  let failed = $state(false);
  const selected = new SvelteSet<string>();

  const additions = $derived(preview?.changes.filter((change) => change.status === 'add') ?? []);
  const conflicts = $derived(
    preview?.changes.filter((change) => change.status === 'conflict') ?? [],
  );

  const SECTION_LABELS: Record<string, string> = {
    preferences: 'Talk choice',
    notes: 'Note',
    comparisons: 'Comparison',
    itinerary: 'Saved itinerary',
    plans: 'Plan edits',
    resolvedPlans: 'Saved plan',
    rooms: 'Devroom choices',
    roomsDecided: 'Devroom step',
    boothVisits: 'Booth visit',
    'contact.profile': 'Contact card',
    'contact.selection': 'Sharing selection',
  };
  const REASONS: Record<ImportSkip['reason'], string> = {
    'unknown-event': 'that programme is not on this device',
    missing: 'not in the current programme',
    ambiguous: 'the CFP entry repeats; no exact session matched',
    'wrong-event': 'belongs to another event',
    unassigned: 'no event recorded in the file',
    duplicate: 'listed twice in the file',
  };
  const sectionLabel = (section: string) => SECTION_LABELS[section] ?? section;
  const changeName = (change: ImportChange) => `${sectionLabel(change.section)}: ${change.label}`;

  function reset(): void {
    preview = null;
    fileName = '';
    selected.clear();
  }

  async function choose(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy) return;
    busy = true;
    status = '';
    failed = false;
    reset();
    try {
      const result = await previewPersonalDataImport(await file.text());
      preview = result;
      fileName = file.name;
      for (const change of result.changes) if (change.status === 'add') selected.add(change.id);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      status = `This file cannot be imported (${message}). Nothing was changed.`;
    } finally {
      busy = false;
    }
  }

  async function apply(): Promise<void> {
    if (!preview || busy) return;
    const changes = preview.changes.filter((change) => selected.has(change.id));
    busy = true;
    status = '';
    failed = false;
    try {
      const { applied, refreshed } = await applyPersonalDataImport(changes);
      const count = `Imported ${applied} ${applied === 1 ? 'record' : 'records'}.`;
      status = refreshed
        ? `${count} Your choices, plan and reminders now use the imported data.`
        : `${count} Reload the app to see them everywhere.`;
      reset();
    } catch (error) {
      failed = true;
      status =
        error instanceof PersonalDataImportStaleError
          ? 'Your data on this device changed after the preview. Nothing was imported; choose the file again to see a fresh preview.'
          : 'Could not import the file. Nothing was changed. Please try again.';
      reset();
    } finally {
      busy = false;
    }
  }
</script>

<section class="card" aria-labelledby="personal-data-import-title">
  <h2 id="personal-data-import-title">Import personal data</h2>
  <p class="muted">
    Restore a personal data file exported from another browser. You see what would change before
    anything is written; choices already on this device are kept unless you tick them. Sessions are
    matched by their CFP identity, never by title.
  </p>
  <label class="button secondary file">
    <input type="file" accept=".json,application/json" onchange={choose} disabled={busy} />
    {busy && !preview ? 'Reading file…' : 'Choose personal data file'}
  </label>
  {#if preview}
    <div class="preview" data-testid="import-preview">
      <p class="muted">
        <strong>{fileName}</strong>, exported {new Date(preview.exportedAt).toLocaleString()}:
        {additions.length} new, {conflicts.length} different on this device, {preview.unchanged} already
        the same, {preview.skipped.length} not importable.
      </p>
      {#if additions.length > 0}
        <h3>New on this device</h3>
        <ul class="changes" data-testid="import-new">
          {#each additions as change (change.id)}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(change.id)}
                  onchange={(e) =>
                    e.currentTarget.checked ? selected.add(change.id) : selected.delete(change.id)}
                />
                <span>
                  <span class="name">{changeName(change)}</span>
                  <span class="detail">{change.incomingSummary}</span>
                </span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
      {#if conflicts.length > 0}
        <h3>Different on this device</h3>
        <p class="muted small">Kept as they are unless you tick them.</p>
        <ul class="changes" data-testid="import-conflicts">
          {#each conflicts as change (change.id)}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(change.id)}
                  onchange={(e) =>
                    e.currentTarget.checked ? selected.add(change.id) : selected.delete(change.id)}
                />
                <span>
                  <span class="name">{changeName(change)}</span>
                  <span class="detail">Here: {change.currentSummary}</span>
                  <span class="detail">File: {change.incomingSummary}</span>
                </span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
      {#if preview.skipped.length > 0}
        <h3>Not importable</h3>
        <p class="muted small">
          Shown so nothing is lost silently. Keep the file and try again after a programme update.
        </p>
        <ul class="skipped" data-testid="import-skipped">
          {#each preview.skipped as skip, index (`${skip.section}-${skip.label}-${index}`)}
            <li>
              <span class="name">{sectionLabel(skip.section)}: {skip.label}</span>
              <span class="detail"
                >{REASONS[skip.reason]}{skip.detail ? ` — ${skip.detail}` : ''}</span
              >
            </li>
          {/each}
        </ul>
      {/if}
      {#if preview.unsupported.length > 0}
        <h3>Not understood by this version</h3>
        <ul class="skipped" data-testid="import-unsupported">
          {#each preview.unsupported as path (path)}
            <li><span class="name">{path}</span></li>
          {/each}
        </ul>
      {/if}
      <div class="actions">
        <button
          class="button"
          data-testid="import-apply"
          onclick={apply}
          disabled={busy || selected.size === 0}
        >
          {busy ? 'Importing…' : `Import ${selected.size} selected`}
        </button>
        <button class="button secondary" onclick={reset} disabled={busy}>Cancel</button>
      </div>
    </div>
  {/if}
  {#if status}
    <p role={failed ? 'alert' : 'status'}>{status}</p>
  {/if}
</section>

<style>
  .file {
    position: relative;
    display: inline-block;
    cursor: pointer;
  }
  .file input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .preview {
    margin-top: 0.8rem;
  }
  h3 {
    font-size: 0.85rem;
    margin: 0.8rem 0 0.2rem;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0.2rem 0 0.4rem;
  }
  li {
    margin: 0.35rem 0;
  }
  .changes label {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    cursor: pointer;
  }
  .changes input {
    margin-top: 0.2rem;
    accent-color: var(--event-primary-dark);
  }
  .name {
    display: block;
    font-weight: 600;
  }
  .detail {
    display: block;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.6rem;
  }
</style>
