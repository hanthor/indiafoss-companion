<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { formatDayLabel, formatTime, getEventDays } from '@indiafoss/schedule';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import DevroomBanner from '$lib/components/DevroomBanner.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import { devroomColor } from '$lib/devroom-art';
  import { DEVROOM_SOURCE, devroomProfiles } from '$lib/devroom-profiles';

  const id = $derived(page.params.id ?? '');
  const bundle = $derived(eventState.bundle);
  const track = $derived(bundle?.tracks.find((t) => t.id === id));
  const profile = $derived(bundle?.id === 'indiafoss-2026' ? devroomProfiles[id] : undefined);
  const color = $derived(bundle ? devroomColor(id, bundle.id) : undefined);

  const sessions = $derived(
    (bundle?.activities ?? [])
      .filter((a) => (a.devroomId ?? a.trackId) === id && a.start)
      .sort((a, b) => a.start!.localeCompare(b.start!)),
  );
  const first = $derived(sessions[0]);
  const last = $derived(sessions.at(-1));
  const room = $derived(bundle?.locations.find((l) => l.id === first?.locationId));
  const dayNumber = $derived(
    bundle && first ? getEventDays(bundle).indexOf(first.start!.slice(0, 10)) + 1 : 0,
  );
  const speakerNames = (ids: readonly string[]) =>
    ids
      .map((sid) => bundle?.people.find((p) => p.id === sid)?.name)
      .filter(Boolean)
      .join(', ');
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('');
</script>

<EventGate>
  {#if !track}
    <p>Devroom not found.</p>
  {:else}
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href={resolve('/')}>Devrooms</a>
    </nav>

    <!-- Mirrors .dr-hero on fossunited.org's devroom pages: the room's pattern,
         then its name and tagline. -->
    <header class="hero" style:--accent={color ?? 'var(--amber)'}>
      <div class="banner"><DevroomBanner trackId={track.id} eventId={bundle!.id} /></div>
      <p class="eyebrow">Devroom</p>
      <h1>{track.name}</h1>
      {#if profile}<p class="tagline">{profile.tagline}</p>{/if}
      {#if first && last}
        <p class="when">
          {#if dayNumber > 0}<span class="chip">Day {dayNumber}</span>{/if}
          <span>{formatDayLabel(first.start!.slice(0, 10))}</span>
          <span>{formatTime(first.start!)}–{formatTime(last.end ?? last.start!)}</span>
          {#if room}<a href={resolve(`/map/to/${room.id}`)}>{room.name}</a>{/if}
        </p>
      {/if}
      <p class="actions">
        <a class="primary" href={resolve(`/plan/rank?mode=rooms#devroom-${track.id}`)}
          >Pick talks from this devroom</a
        >
        {#if profile}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
          <a href="{DEVROOM_SOURCE}/{profile.slug}" target="_blank" rel="noopener noreferrer"
            >On fossunited.org ↗</a
          >
        {/if}
      </p>
    </header>

    {#if profile && profile.about.length > 0}
      <section class="card" aria-labelledby="about-heading">
        <h2 id="about-heading">About</h2>
        {#each profile.about as block, i (i)}
          {#if 'heading' in block}
            <h3>{block.heading}</h3>
          {:else if 'list' in block}
            <ul>
              {#each block.list as item (item)}<li>{item}</li>{/each}
            </ul>
          {:else}
            <p>{block.text}</p>
          {/if}
        {/each}
      </section>
    {/if}

    <section class="card" aria-labelledby="sessions-heading" style:--accent={color}>
      <h2 id="sessions-heading">Sessions <span class="count">{sessions.length}</span></h2>
      <ol class="sessions">
        {#each sessions as s (s.id)}
          <li>
            <span class="time">{formatTime(s.start!)}</span>
            <a href={resolve(`/activity/${s.id}`)}>
              <strong>{s.title}</strong>
              <span class="meta"><TypeBadge type={s.type} />{speakerNames(s.speakerIds)}</span>
            </a>
          </li>
        {/each}
      </ol>
    </section>

    {#if profile && profile.managers.length > 0}
      <section class="card" aria-labelledby="managers-heading">
        <h2 id="managers-heading">Devroom managers</h2>
        <ul class="managers">
          {#each profile.managers as name (name)}
            <li style:--accent={color}>
              <span class="avatar" aria-hidden="true">{initials(name)}</span>{name}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</EventGate>

<style>
  .crumbs {
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }
  .hero {
    padding: 0.75rem;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    border-top: 4px solid var(--accent);
    margin-bottom: 1rem;
  }
  .banner :global(.devroom-banner) {
    aspect-ratio: 16 / 5;
  }
  .eyebrow {
    margin: 0.9rem 0 0.1rem;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--accent) 55%, var(--text));
  }
  h1 {
    margin: 0;
    font-size: 1.45rem;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }
  .tagline {
    margin: 0.3rem 0 0;
    color: var(--text-muted);
  }
  .when {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.75rem;
    margin: 0.75rem 0 0;
    font-size: 0.88rem;
  }
  .chip {
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin: 0.9rem 0 0.1rem;
  }
  .primary {
    padding: 0.5rem 0.9rem;
    border-radius: var(--radius);
    background: var(--ink-2);
    color: var(--on-ink);
    font-weight: 600;
    text-decoration: none;
  }
  .card {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 1rem;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
  }
  h3 {
    margin: 0.9rem 0 0.3rem;
    font-size: 0.95rem;
  }
  .card p {
    margin: 0 0 0.6rem;
    line-height: 1.5;
  }
  .card ul {
    margin: 0 0 0.6rem;
    padding-left: 1.2rem;
    line-height: 1.5;
  }
  .count {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .sessions {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .sessions li {
    display: grid;
    grid-template-columns: 3.2rem 1fr;
    gap: 0.6rem;
    padding: 0.55rem 0;
    border-top: 1px solid var(--line-soft);
  }
  .sessions li:first-child {
    border-top: 0;
  }
  .time {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--text-muted);
    padding-top: 0.1rem;
  }
  .sessions a {
    display: block;
    padding-left: 0.6rem;
    border-left: 3px solid var(--accent, var(--line));
    color: inherit;
    text-decoration: none;
  }
  .sessions strong {
    display: block;
    line-height: 1.3;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.2rem;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .managers {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    margin: 0;
    padding: 0;
  }
  .managers li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    background: color-mix(in srgb, var(--accent) 25%, var(--surface-raised));
  }
</style>
