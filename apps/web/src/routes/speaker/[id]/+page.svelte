<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { formatDayLabel, formatTime } from '@indiafoss/schedule';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import { linksFromUrls } from '@indiafoss/model';

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
    <article class="speaker-profile">
      <header class="speaker-header">
        <div class="speaker-identity">
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
        </div>
        {#if speaker.bio}<p class="bio">{speaker.bio}</p>{/if}
        {#if speaker.links.length > 0}
          <SocialLinks links={linksFromUrls(speaker.links)} />
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
    </article>
  {/if}
</EventGate>

<style>
  .speaker-profile {
    max-width: 52rem;
    margin-inline: auto;
    padding-block: 1rem 2rem;
    display: grid;
    gap: 2rem;
  }
  .speaker-header {
    display: grid;
    gap: 1rem;
  }
  .speaker-identity {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  .speaker-identity > div {
    min-width: 0;
  }
  .speaker-identity h1 {
    overflow-wrap: anywhere;
  }
  h2 {
    margin: 0 0 0.75rem;
  }

  h1 {
    margin: 0;
  }
  .avatar {
    flex-shrink: 0;
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
    margin: 0;
    max-width: 65ch;
    white-space: pre-line;
    color: var(--text-muted);
    line-height: 1.55;
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
    padding: 0.75rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
  }
  .sessions p {
    margin: 0.5rem 0 0;
  }
  .sessions a {
    font-weight: 600;
    color: var(--text);
  }
</style>
