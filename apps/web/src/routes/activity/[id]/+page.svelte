<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { activityToIcs, formatDayLabel, formatTime } from '@indiafoss/schedule';
  import { bookmarked, dispositionOf, setDisposition, toggleBookmark } from '$lib/prefs.svelte';
  import { downloadTextFile, shareCalendarFile } from '$lib/calendar';
  import { conferenceChatQuery } from '$lib/matrix.svelte';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const activityId = $derived(page.params.id);
  const bundle = $derived(eventState.bundle!);

  const activity = $derived(bundle?.activities.find((a) => a.id === activityId) ?? null);
  const location = $derived(bundle?.locations.find((l) => l.id === activity?.locationId));
  const track = $derived(bundle?.tracks.find((t) => t.id === activity?.trackId));
  const speakers = $derived(
    activity?.speakerIds
      .map((id) => bundle.people.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p)) ?? [],
  );

  const disposition = $derived(activity ? dispositionOf(activity.id) : 'normal');
  const isBookmarked = $derived(activity ? bookmarked(activity.id) : false);
  let calendarMessage = $state('');

  async function addToCalendar(): Promise<void> {
    if (!activity || !bundle) return;
    const ics = activityToIcs(bundle, activity, { includeAlarm: true });
    const filename = `${activity.id}.ics`;
    try {
      const shared = await shareCalendarFile(filename, ics);
      if (!shared) downloadTextFile(filename, ics, 'text/calendar;charset=utf-8');
      calendarMessage = shared ? 'Calendar share opened.' : 'Calendar file downloaded.';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      downloadTextFile(filename, ics, 'text/calendar;charset=utf-8');
      calendarMessage = 'Calendar file downloaded.';
    }
  }

  function onDisposition(value: 'must-attend' | 'not-interested' | 'watch-later' | 'normal') {
    if (activity) void setDisposition(activity.id, value);
  }
</script>

<EventGate>
  {#if !activity}
    <p>Session not found.</p>
  {:else}
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href={resolve('/schedule')}>Schedule</a>
    </nav>

    <header>
      <h1>{activity.title}</h1>
      <p class="muted">
        <TypeBadge type={activity.type} />
        {#if activity.cancelled}<span class="cancel">cancelled</span>{/if}
      </p>
      {#if activity.subtitle}<p class="subtitle">{activity.subtitle}</p>{/if}
      <div class="badges">
        {#if activity.audience}<span class="meta-badge">Audience: {activity.audience}</span>{/if}
        {#if activity.proposalStatus}<span class="meta-badge">{activity.proposalStatus}</span>{/if}
      </div>
    </header>

    <section class="facts">
      {#if activity.start && activity.end}
        <p>
          <strong>{formatDayLabel(activity.start.slice(0, 10))}</strong> · {formatTime(
            activity.start,
          )}–{formatTime(activity.end)}
        </p>
      {/if}
      {#if location}
        <p>
          <strong>{location.name}</strong>
          {#if track && track.name !== location.name}
            · {track.name}{/if}
        </p>
      {/if}
    </section>

    <section class="actions" aria-label="Personal preferences (§17)">
      <button class="calendar" onclick={addToCalendar}>Add to calendar</button>
      {#if activity && conferenceChatQuery(bundle, 'session', activity.id, activity.title)}
        <a
          class="chatlink"
          href={resolve(
            `/chat?${conferenceChatQuery(
              bundle,
              'session',
              activity.id,
              `Chat: ${activity.title}`,
              `IndiaFOSS session chat — ${activity.title}`,
            )}`,
          )}>💬 Session chat</a
        >
      {/if}
      <button
        class:active={isBookmarked}
        aria-pressed={isBookmarked}
        onclick={() => toggleBookmark(activity.id)}
      >
        ☆ Bookmark
      </button>
      <button
        class:active={disposition === 'must-attend'}
        onclick={() => onDisposition(disposition === 'must-attend' ? 'normal' : 'must-attend')}
      >
        ★ Must attend
      </button>
      <button
        class:active={disposition === 'not-interested'}
        onclick={() =>
          onDisposition(disposition === 'not-interested' ? 'normal' : 'not-interested')}
      >
        × Not interested
      </button>
      <button
        class:active={disposition === 'watch-later'}
        onclick={() => onDisposition(disposition === 'watch-later' ? 'normal' : 'watch-later')}
      >
        ▸ Watch later
      </button>
    </section>
    {#if calendarMessage}<p class="muted small" role="status">{calendarMessage}</p>{/if}

    {#if speakers.length > 0}
      <section>
        <h2>Speakers</h2>
        <ul class="speakers">
          {#each speakers as speaker (speaker.id)}
            <li class="speaker">
              {#if speaker.avatarUrl}
                <!-- public speaker image from the captured FOSS United page -->
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                <img src={speaker.avatarUrl} alt="" loading="lazy" />
              {/if}
              <div>
                <a href={resolve(`/speaker/${speaker.id}`)}>{speaker.name}</a>
                {#if speaker.designation || speaker.organization}
                  <p class="muted small">
                    {speaker.designation}{#if speaker.designation && speaker.organization}
                      ·
                    {/if}{speaker.organization}
                  </p>
                {/if}
                {#if speaker.bio}<p class="muted small">{speaker.bio.slice(0, 180)}…</p>{/if}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if activity.description}
      <section>
        <h2>About</h2>
        <p class="description">{activity.description}</p>
      </section>
    {/if}

    {#if activity.keyTakeaways && activity.keyTakeaways.length > 0}
      <section>
        <h2>Key takeaways</h2>
        <ul class="takeaways">
          {#each activity.keyTakeaways as takeaway (takeaway)}
            <li>{takeaway}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if activity.tags.length > 0}
      <section class="tags">
        {#each activity.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
      </section>
    {/if}

    {#if activity.recordingUrl || activity.slidesUrl || activity.links?.length || activity.references?.length || activity.sourceUrl}
      <section class="media">
        <h2>Resources</h2>
        <div class="resource-list">
          {#if activity.recordingUrl}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={activity.recordingUrl} rel="noreferrer">Watch recording</a>
          {/if}
          {#if activity.slidesUrl}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={activity.slidesUrl} rel="noreferrer">Slides</a>
          {/if}
          {#each activity.links ?? [] as link (link.url)}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={link.url} rel="noreferrer">{link.label}</a>
          {/each}
          {#each activity.references ?? [] as link (link.url)}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={link.url} rel="noreferrer">Reference: {link.label}</a>
          {/each}
          {#if activity.sourceUrl}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={activity.sourceUrl} rel="noreferrer">View original proposal</a>
          {/if}
        </div>
      </section>
    {/if}
  {/if}
</EventGate>

<style>
  .crumbs a {
    color: var(--text-muted);
    font-size: 0.85rem;
    text-decoration: none;
  }
  h1 {
    margin: 0.4rem 0 0.3rem;
    line-height: 1.25;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .subtitle {
    color: var(--text-muted);
    font-size: 0.95rem;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.6rem;
  }
  .meta-badge {
    border: 1px solid color-mix(in srgb, var(--event-primary-dark) 35%, transparent);
    border-radius: 999px;
    color: var(--event-primary-dark);
    font-size: 0.72rem;
    padding: 0.2rem 0.55rem;
  }
  .cancel {
    color: var(--danger);
    text-transform: uppercase;
    font-size: 0.7rem;
    margin-left: 0.4rem;
  }
  .facts p {
    margin: 0.25rem 0;
    font-size: 0.95rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 1rem 0;
  }
  .actions button {
    border: 1px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
    background: var(--surface);
    border-radius: 999px;
    padding: 0.45rem 0.85rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .actions .chatlink {
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
  .actions button.calendar {
    border-color: var(--event-primary-dark);
    background: var(--event-primary);
    color: var(--event-secondary);
    font-weight: 700;
  }
  .actions button.active {
    border-color: var(--event-accent);
    background: color-mix(in srgb, var(--event-accent) 15%, transparent);
    color: var(--text);
    font-weight: 600;
  }
  .speakers {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .speakers li {
    margin-bottom: 0.6rem;
  }
  .speaker {
    display: flex;
    gap: 0.65rem;
    align-items: flex-start;
  }
  .speaker img {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    object-fit: cover;
    background: var(--surface-raised);
  }
  .speakers a {
    font-weight: 600;
    color: var(--text);
  }
  .description {
    line-height: 1.55;
  }
  .takeaways {
    padding-left: 1.2rem;
    line-height: 1.5;
  }
  .takeaways li {
    margin-bottom: 0.45rem;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 1rem 0;
  }
  .tag {
    font-size: 0.75rem;
    background: var(--surface-raised);
    border: 1px solid color-mix(in srgb, var(--text-muted) 25%, transparent);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    color: var(--text-muted);
  }
  .media {
    margin-top: 1rem;
  }
  .resource-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .resource-list a {
    color: var(--event-primary-dark);
    font-size: 0.85rem;
  }
</style>
