<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { formatDayLabel, formatTime } from '@indiafoss/schedule';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const speakerId = $derived(page.params.id ?? '');
  const bundle = $derived(eventState.bundle!);

  const speaker = $derived(bundle?.people.find((p) => p.id === speakerId) ?? null);
  const sessions = $derived(
    bundle?.activities
      .filter((a) => a.speakerIds.includes(speakerId))
      .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')) ?? [],
  );

  const locationName = (id: string | undefined): string | undefined =>
    bundle?.locations.find((l) => l.id === id)?.name;
</script>

<EventGate>
  {#if !speaker}
    <p>Speaker not found.</p>
  {:else}
    <header class="speaker-header">
      {#if speaker.avatarUrl}
        <!-- public speaker image from the captured FOSS United data -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <img class="avatar" src={speaker.avatarUrl} alt="" />
      {/if}
      <div>
        <h1>{speaker.name}</h1>
        {#if speaker.designation || speaker.organization}
          <p class="muted role">
            {speaker.designation}{#if speaker.designation && speaker.organization}
              ·
            {/if}{speaker.organization}
          </p>
        {/if}
      </div>
      {#if speaker.bio}<p class="bio">{speaker.bio}</p>{/if}
      {#if speaker.links.length > 0}
        <p class="links">
          {#each speaker.links as link (link.url)}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={link.url} rel="noreferrer">{link.label}</a>
          {/each}
        </p>
      {/if}
    </header>

    <section>
      <h2>Sessions ({sessions.length})</h2>
      {#if sessions.length === 0}
        <p class="muted">No scheduled sessions.</p>
      {:else}
        <ul class="sessions">
          {#each sessions as s (s.id)}
            <li>
              <a href={resolve(`/activity/${s.id}`)}>{s.title}</a>
              <p class="muted small">
                <TypeBadge type={s.type} />
                {#if s.start}
                  {formatDayLabel(s.start.slice(0, 10))} · {formatTime(s.start)} · {locationName(
                    s.locationId,
                  )}
                {/if}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</EventGate>

<style>
  .speaker-header {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: center;
  }
  h1 {
    margin: 0;
  }
  .avatar {
    width: 4rem;
    height: 4rem;
    object-fit: cover;
    border-radius: 50%;
    background: var(--surface-raised);
  }
  .role {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
  }
  .bio {
    grid-column: 1 / -1;
    color: var(--text-muted);
    line-height: 1.55;
  }
  .links {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .links a {
    color: var(--event-primary-text);
    font-size: 0.9rem;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .sessions {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .sessions li {
    padding: 0.5rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
  }
  .sessions a {
    font-weight: 600;
    color: var(--text);
  }
</style>
