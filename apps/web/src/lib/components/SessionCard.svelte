<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Activity, EventBundle } from '@indiafoss/model';
  import { formatTime } from '@indiafoss/schedule';
  import { bookmarked, toggleBookmark } from '$lib/prefs.svelte';
  import TypeBadge from './TypeBadge.svelte';

  let { activity, bundle }: { activity: Activity; bundle: EventBundle } = $props();

  const location = $derived(bundle.locations.find((l) => l.id === activity.locationId));
  const speakers = $derived(
    activity.speakerIds
      .map((id) => bundle.people.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p)),
  );

  async function onBookmark(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    await toggleBookmark(activity.id);
  }
</script>

<article class="session" class:cancelled={activity.cancelled}>
  <time class="times" datetime={activity.start}>
    {#if activity.start && activity.end}
      {formatTime(activity.start)}–{formatTime(activity.end)}
    {/if}
  </time>

  <div class="body">
    <h3>
      <a href={resolve(`/activity/${activity.id}`)}>{activity.title}</a>
    </h3>
    <p class="meta">
      {#if location}<span>{location.name}</span>{/if}
      {#if speakers.length > 0}
        <span>{speakers.map((s) => s.name).join(', ')}</span>
      {/if}
    </p>
    <div class="chips">
      <TypeBadge type={activity.type} />
      {#if activity.cancelled}<span class="chip cancelled">cancelled</span>{/if}
    </div>
  </div>

  <button
    class="bookmark"
    class:active={bookmarked(activity.id)}
    aria-pressed={bookmarked(activity.id)}
    aria-label={bookmarked(activity.id) ? 'Remove bookmark' : 'Bookmark session'}
    onclick={onBookmark}>★</button
  >
</article>

<style>
  .session {
    display: grid;
    grid-template-columns: 5.5rem 1fr auto;
    gap: 0.75rem;
    align-items: start;
    padding: 0.65rem 0.25rem;
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
  }

  .session.cancelled h3 a,
  .session.cancelled .meta {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .times {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-muted);
    padding-top: 0.2rem;
  }
  .session:hover {
    box-shadow: inset 4px 0 0 var(--mint);
  }

  h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    line-height: 1.3;
  }

  h3 a {
    color: var(--text);
    text-decoration: none;
  }

  h3 a:hover {
    text-decoration: underline;
    text-decoration-color: var(--event-accent);
  }

  .meta {
    margin: 0 0 0.4rem;
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  .meta span + span::before {
    content: ' · ';
  }

  .chips {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .chip.cancelled {
    background: var(--danger);
    color: #fff;
  }

  .bookmark {
    border: none;
    background: none;
    font-size: 1.25rem;
    color: color-mix(in srgb, var(--text-muted) 45%, transparent);
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
    border-radius: 8px;
  }

  .bookmark:hover {
    background: color-mix(in srgb, var(--event-accent) 18%, transparent);
  }

  .bookmark.active {
    color: var(--event-accent);
  }
</style>
