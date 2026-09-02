<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Activity, EventBundle } from '@indiafoss/model';
  import { formatTime } from '@indiafoss/schedule';
  import { bookmarked, dispositionOf, setDisposition, toggleBookmark } from '$lib/prefs.svelte';
  import TypeBadge from './TypeBadge.svelte';

  let {
    activity,
    bundle,
    compactTime = false,
  }: { activity: Activity; bundle: EventBundle; compactTime?: boolean } = $props();

  const location = $derived(bundle.locations.find((l) => l.id === activity.locationId));
  const speakers = $derived(
    activity.speakerIds
      .map((id) => bundle.people.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p)),
  );

  const mustAttend = $derived(dispositionOf(activity.id) === 'must-attend');

  async function onMustAttend(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    await setDisposition(activity.id, mustAttend ? 'normal' : 'must-attend');
  }

  async function onBookmark(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    await toggleBookmark(activity.id);
  }
</script>

<article class="session" class:cancelled={activity.cancelled} class:compact={compactTime}>
  {#if !compactTime}
    <time class="times" datetime={activity.start}>
      {#if activity.start && activity.end}
        {formatTime(activity.start)}–{formatTime(activity.end)}
      {/if}
    </time>
  {/if}

  <div class="body">
    <h3>
      <a href={resolve(`/activity/${activity.id}`)}>{activity.title}</a>
    </h3>
    <p class="meta">
      {#if compactTime && activity.end}<span>until {formatTime(activity.end)}</span>{/if}
      {#if location}<span>{location.name}</span>{/if}
      {#if speakers.length > 0}
        <span>{speakers.map((s) => s.name).join(', ')}</span>
      {/if}
    </p>
    <div class="chips">
      <TypeBadge type={activity.type} />
      {#if activity.cancelled}<span class="chip cancelled">cancelled</span>{/if}
      {#if mustAttend}<span class="chip must">must attend</span>{/if}
    </div>
  </div>

  <div class="marks">
    <button
      class="bookmark"
      class:active={bookmarked(activity.id)}
      aria-pressed={bookmarked(activity.id)}
      aria-label={bookmarked(activity.id) ? 'Remove bookmark' : 'Bookmark session'}
      onclick={onBookmark}>★</button
    >
    <button
      class="must"
      class:active={mustAttend}
      aria-pressed={mustAttend}
      aria-label={mustAttend ? 'Remove from must attend' : 'Mark as must attend'}
      title="Must attend: pinned in your plan, extra reminders"
      onclick={onMustAttend}>MUST</button
    >
  </div>
</article>

<style>
  .session.compact {
    grid-template-columns: 1fr auto;
  }
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

  .chip.must {
    background: var(--amber);
    color: var(--ink);
  }

  .marks {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .must {
    border: none;
    background: none;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
    border-radius: 8px;
  }
  .must:hover {
    background: color-mix(in srgb, var(--amber) 25%, transparent);
  }
  .must.active {
    color: var(--amber-ink);
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
