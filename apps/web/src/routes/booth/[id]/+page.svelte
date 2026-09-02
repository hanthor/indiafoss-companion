<script lang="ts">
  import { conferenceChatQuery } from '$lib/matrix.svelte';
  import { boothRoomLink } from '$lib/element-links';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import { linksFromUrls } from '@indiafoss/model';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { CompanionStorage } from '@indiafoss/storage';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  const boothId = $derived(page.params.id ?? '');
  const bundle = $derived(eventState.bundle!);
  const booth = $derived(bundle?.booths.find((b) => b.id === boothId) ?? null);
  const location = $derived(bundle?.locations.find((l) => l.id === booth?.locationId));

  const storage = new CompanionStorage();
  let scheduled = $state<string | null>(null);

  $effect(() => {
    if (!booth) return;
    void storage.getSetting(`booth-visit-${booth.id}`).then((v) => {
      scheduled = v ?? null;
    });
  });

  async function scheduleVisit(minutes: number): Promise<void> {
    if (!booth) return;
    await storage.setSetting(`booth-visit-${booth.id}`, String(minutes));
    scheduled = String(minutes);
  }

  async function cancelVisit(): Promise<void> {
    if (!booth) return;
    await storage.setSetting(`booth-visit-${booth.id}`, '');
    scheduled = null;
  }
</script>

<EventGate>
  {#if !booth}
    <p>Booth not found.</p>
  {:else}
    <h1>{booth.name}</h1>
    <p class="muted">{booth.category}</p>
    {#if booth.description}<p>{booth.description}</p>{/if}
    {#if booth.website}
      <SocialLinks links={linksFromUrls([{ label: 'Website', url: booth.website }])} />
    {/if}
    {#if location}
      <p class="muted small">
        <a href={resolve('/map')}>Find on map</a> · {location.name}
      </p>
    {/if}

    {#if conferenceChatQuery(bundle, 'booth', booth.id, booth.name)}
      <p>
        <a
          class="chatlink"
          href={resolve(
            `/chat?${conferenceChatQuery(
              bundle,
              'booth',
              booth.id,
              `Booth: ${booth.name}`,
              `Talk to the ${booth.name} booth`,
            )}`,
          )}>💬 Booth chat</a
        >
      </p>
    {/if}
    {#if boothRoomLink(bundle, booth)}
      {@const room = boothRoomLink(bundle, booth)!}
      <p>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- external matrix.to link -->
        <a class="chatlink" href={room.href} target="_blank" rel="noreferrer" title={room.alias}
          >Open {room.name} on Matrix ↗</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </p>
    {/if}
    <section class="visit" aria-label="Schedule a booth visit">
      <h2>Plan a visit</h2>
      {#if scheduled}
        <p class="muted">
          Scheduled: {scheduled} min — your plan will place it in a gap.
        </p>
        <button class="ghost" onclick={cancelVisit}>Cancel</button>
      {:else}
        <div class="row">
          <button onclick={() => scheduleVisit(15)}>Schedule 15 min</button>
          <button onclick={() => scheduleVisit(30)}>Schedule 30 min</button>
        </div>
      {/if}
    </section>
  {/if}
</EventGate>

<style>
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .chatlink {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--text);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .visit {
    margin-top: 1.2rem;
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 0.9rem 1rem;
  }
  .visit h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .row button,
  .ghost {
    border: 1px solid var(--event-primary);
    background: var(--surface);
    color: var(--event-primary-text);
    border-radius: 999px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }
  .row button:hover {
    background: color-mix(in srgb, var(--event-primary) 10%, transparent);
  }
</style>
