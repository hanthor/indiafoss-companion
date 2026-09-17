<script lang="ts">
  import { CURRENT_RECORD, readinessRows } from '$lib/readiness';

  const rows = readinessRows(CURRENT_RECORD);
  const labels = {
    available: 'Available',
    unproven: 'Not proven on a phone',
    'not-working': 'Tested, not working',
    'not-recorded': 'Not recorded',
  } as const;
  const pins = CURRENT_RECORD.components;
</script>

<section class="card" aria-labelledby="readiness-title">
  <h2 id="readiness-title">What this build has been shown to do</h2>
  <p class="muted small">
    From the release record <code>{CURRENT_RECORD.id}</code>. Anything not listed as available is
    unavailable: a fix that merged, or a test that passed on a build machine, is not a phone result.
    "Tested, not working" means somebody looked and wrote down why.
  </p>
  <ul class="readiness">
    {#each rows as row (row.name)}
      <li class={row.status}>
        <div class="head">
          <strong>{row.meaning}</strong>
          <span class="status">{labels[row.status]}</span>
        </div>
        <code class="small">{row.name}</code>
        {#if row.level}
          <span class="muted small">
            Evidence: {row.level}{row.topology ? ` on ${row.topology}` : ''}{row.evidence
              ? ` (${row.evidence})`
              : ''}
          </span>
        {/if}
        {#if row.detail}<span class="muted small">Not covered: {row.detail}</span>{/if}
      </li>
    {/each}
  </ul>
  <details>
    <summary class="small">Exact components this record pins</summary>
    <ul class="pins">
      {#each pins as pin (pin.name)}
        <li class="small">
          <code>{pin.name}</code>
          {pin.revision.slice(0, 12)}{pin.checksum ? ` · ${pin.checksum.slice(0, 19)}…` : ''}
        </li>
      {/each}
    </ul>
  </details>
</section>

<style>
  .readiness {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }
  .readiness li {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.55rem 0;
    border-top: 1px solid var(--line);
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .status {
    white-space: nowrap;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  li.available .status {
    color: var(--event-accent);
  }
  .pins {
    list-style: none;
    padding: 0;
    margin: 0.25rem 0 0;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
</style>
