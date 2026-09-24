<script lang="ts">
  import { PRE_CONFERENCE_EVENTS } from '$lib/pre-conference';
</script>

<!-- Organised alongside IndiaFOSS but ticketed apart from it; see pre-conference.ts. -->
<section class="pre card" aria-labelledby="pre-heading">
  <h2 id="pre-heading">The day before: Thu 25 Sep</h2>
  <p class="lede">
    Two events run before the conference. Neither is part of the conference ticket.
  </p>
  {#each PRE_CONFERENCE_EVENTS as event (event.id)}
    <details class="event">
      <summary>
        <h3>{event.title}</h3>
        <span class="meta">{event.when} · {event.where}</span>
      </summary>
      <p class="access">{event.access}</p>
      <ul class="notes">
        {#each event.notes as note (note)}<li>{note}</li>{/each}
      </ul>
      {#if event.sessions}
        <ol class="sessions">
          {#each event.sessions as s (s.title)}
            <li>
              <span class="time">{s.time}</span>
              <span
                ><strong>{s.title}</strong>{#if s.speakers}<span class="who">{s.speakers}</span
                  >{/if}</span
              >
            </li>
          {/each}
        </ol>
      {/if}
      <p class="links">
        <!-- eslint-disable svelte/no-navigation-without-resolve -- external links -->
        <a href={event.url} target="_blank" rel="noopener noreferrer">{event.linkLabel} ↗</a>
        <a href={event.mapUrl} target="_blank" rel="noopener noreferrer">Venue on the map ↗</a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </p>
    </details>
  {/each}
</section>

<style>
  .pre {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 1rem;
  }
  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.05rem;
  }
  .lede {
    margin: 0 0 0.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .event {
    border-top: 1px solid var(--line);
    padding-block: 0.5rem;
  }
  summary {
    cursor: pointer;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.1rem 0.5rem;
  }
  h3 {
    display: inline;
    margin: 0;
    font-size: 0.98rem;
  }
  .meta {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .access {
    margin: 0.5rem 0 0.25rem;
    font-size: 0.92rem;
    font-weight: 600;
  }
  .notes {
    margin: 0 0 0.5rem;
    padding-left: 1.1rem;
    font-size: 0.9rem;
  }
  .sessions {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    font-size: 0.9rem;
  }
  .sessions li {
    display: grid;
    grid-template-columns: 3.2rem 1fr;
    gap: 0.5rem;
    padding-block: 0.25rem;
  }
  .time {
    font-family: var(--font-mono);
    color: var(--text-muted);
  }
  .who {
    display: block;
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0;
  }
</style>
