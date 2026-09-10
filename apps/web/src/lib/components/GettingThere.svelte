<script lang="ts">
  import { resolve } from '$app/paths';
  import { venueAddressLine, venueGeoUri, type EventVenue } from '@indiafoss/model';
  import { copyText } from '$lib/share';

  /**
   * The outdoor half of "how do I get there" (#278): the organiser's venue
   * name and address, and a handoff to the organiser-selected OpenStreetMap
   * destination. Everything shown comes from the cached bundle, so it reads
   * the same with no network. Indoor rooms and floors are the Map tab's job;
   * this card claims nothing about entrances, routes, parking or transport.
   */
  let { venue, compact = false }: { venue: EventVenue; compact?: boolean } = $props();

  const headingId = $props.id();
  const address = $derived(venueAddressLine(venue));
  const geo = $derived(venueGeoUri(venue));

  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  /** `2026-09-10` → `10 Sep 2026`, without trusting the device locale or clock. */
  const checked = $derived.by(() => {
    const [y, m, d] = venue.checkedAt.split('-').map(Number);
    const month = m ? MONTHS[m - 1] : undefined;
    return month && d && y ? `${d} ${month} ${y}` : venue.checkedAt;
  });

  let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyAddress(): Promise<void> {
    copyState = (await copyText(address)) ? 'copied' : 'failed';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (copyState = 'idle'), 4000);
  }
</script>

<section class="card getting-there" aria-labelledby={headingId}>
  <h2 id={headingId}>Getting there</h2>
  <p class="venue">{venue.name}</p>
  <p class="address">{address}</p>
  <div class="actions">
    <!-- eslint-disable svelte/no-navigation-without-resolve -- external organiser map links -->
    <a class="cta" href={venue.mapUrl} target="_blank" rel="noopener noreferrer"
      >Open in OpenStreetMap ↗</a
    >
    {#if geo}
      <a class="ghost" href={geo}>Open in your maps app</a>
    {/if}
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
    <button type="button" class="ghost" onclick={copyAddress}>Copy address</button>
  </div>
  <p class="muted small" role="status">
    {#if copyState === 'copied'}Address copied.{:else if copyState === 'failed'}Could not copy;
      select the address above instead.{/if}
  </p>
  {#if !compact}
    {#if venue.note}
      <p class="muted small">{venue.note}</p>
    {/if}
    <p class="muted small">
      Venue details from the organiser's page, checked {checked}. Rooms and floors inside are on the
      <a href={resolve('/map')}>Map</a>
      tab.
      {#if venue.travelGuideUrl}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- external organiser guide -->
        <a href={venue.travelGuideUrl} target="_blank" rel="noopener noreferrer"
          >Organiser travel guide ↗</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/if}
    </p>
  {/if}
</section>

<style>
  .card {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 1rem;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .venue {
    margin: 0;
    font-weight: 600;
  }
  .address {
    margin: 0.15rem 0 0.75rem;
    user-select: text;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    background: var(--event-primary);
    color: var(--ink);
    padding: 0.55rem 1.2rem;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 600;
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    border: 1px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
    background: var(--surface);
    color: var(--text);
    border-radius: 999px;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font-size: 0.85rem;
    text-decoration: none;
  }
  .muted {
    color: var(--text-muted);
    margin: 0.4rem 0 0;
  }
  .small {
    font-size: 0.82rem;
    line-height: 1.5;
  }
</style>
