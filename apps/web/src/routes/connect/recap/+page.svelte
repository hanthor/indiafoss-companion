<script lang="ts">
  import { resolve } from '$app/paths';
  import { eventState } from '$lib/event.svelte';
  import { contactsState, hydrateContacts } from '$lib/contacts.svelte';
  import { buildRecap, recapCardLines } from '$lib/recap';
  import { drawRecapCard, recapCardBlob } from '$lib/recap-image';
  import EventGate from '$lib/components/EventGate.svelte';

  /**
   * The end-of-conference recap (#31): everyone you met, grouped by day and by
   * where you were standing, and a card you can save or share. Built from the
   * contacts already on this device — nothing is fetched, and the picture is
   * drawn here rather than by a service.
   */
  let withNames = $state(true);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let status = $state('');

  $effect(() => {
    void hydrateContacts();
  });

  const recap = $derived(buildRecap(contactsState.contacts, eventState.bundle ?? null));
  const lines = $derived(
    recapCardLines(recap, eventState.bundle?.name ?? 'IndiaFOSS', { withNames }),
  );

  // Redraw whenever the card's content changes, so the preview is the file.
  $effect(() => {
    if (canvas) drawRecapCard(canvas, lines);
  });

  const filename = 'indiafoss-who-i-met.png';

  async function save(): Promise<void> {
    const blob = await recapCardBlob(lines);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    status = 'Saved to your downloads.';
  }

  async function share(): Promise<void> {
    const blob = await recapCardBlob(lines);
    if (!blob) return;
    const file = new File([blob], filename, { type: 'image/png' });
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: lines.headline });
        status = '';
      } catch {
        status = 'Sharing was cancelled.';
      }
      return;
    }
    await save();
    status = 'This browser cannot share files, so the image was saved instead.';
  }
</script>

<svelte:head>
  <title>Who I met · IndiaFOSS Companion</title>
</svelte:head>

<EventGate>
  <div class="head">
    <a class="eyebrow back" href={resolve('/connect')}>← YOUR CARD</a>
    <h1>Who I met</h1>
  </div>

  {#if recap.total === 0}
    <section class="card empty">
      <h2>Nobody yet</h2>
      <p class="muted">
        Scan someone's card and they land here, with the session or room you were in at the time.
        The recap is built from your own device and never leaves it.
      </p>
      <a class="button" href={resolve('/scan')}>Scan a card</a>
    </section>
  {:else}
    <section class="card preview" aria-labelledby="preview-title">
      <h2 id="preview-title" class="sr-only">Your shareable card</h2>
      <!-- The canvas is the file: what is previewed is exactly what is saved. -->
      <canvas bind:this={canvas} width="1080" height="1080" aria-label={lines.headline}></canvas>
      <label class="switch">
        <input type="checkbox" role="switch" bind:checked={withNames} />
        <span>Include everyone's names</span>
      </label>
      <p class="muted small">
        {withNames
          ? 'The card lists the people you met. Turn this off to share only the count and the places.'
          : 'Only the count and the places are on the card.'}
      </p>
      <div class="actions">
        <button class="button dark" onclick={share}>Share the card</button>
        <button class="button secondary" onclick={save}>Save the image</button>
      </div>
      {#if status}<p class="muted small" role="status">{status}</p>{/if}
    </section>

    {#each recap.days as day (day.day)}
      <section class="day" aria-labelledby={`day-${day.day}`}>
        <div class="dayhead">
          <h2 id={`day-${day.day}`}>{day.label}</h2>
          <span class="muted small">{day.count} {day.count === 1 ? 'person' : 'people'}</span>
        </div>
        {#each day.places as place (place.key)}
          <div class="place">
            <div class="placehead">
              <strong>{place.label}</strong>
              {#if place.when}<span class="when">{place.when}</span>{/if}
            </div>
            <ul class="people">
              {#each place.contacts as person (person.id)}
                <li>
                  <span class="name">{person.fullName || 'Unnamed contact'}</span>
                  {#if person.organization}<span class="muted small">{person.organization}</span
                    >{/if}
                  {#if (person.metCount ?? 1) > 1}
                    <span class="again">met {person.metCount} times</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </section>
    {/each}
  {/if}
</EventGate>

<style>
  .head {
    margin-bottom: 0.9rem;
  }
  .head h1 {
    margin: 0.35rem 0 0;
  }
  .back {
    text-decoration: none;
  }
  .preview {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  canvas {
    width: 100%;
    height: auto;
    max-width: 22rem;
    align-self: center;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 600;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .button.dark {
    background: var(--ink);
    color: var(--on-ink);
    border-color: var(--ink);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
  }
  .empty h2,
  .dayhead h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .day {
    margin-top: 1.2rem;
  }
  .dayhead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.35rem;
  }
  .place {
    margin-top: 0.8rem;
  }
  .placehead {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .when {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .people {
    list-style: none;
    padding: 0;
    margin: 0.35rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .people li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.45rem 0.7rem;
  }
  .name {
    font-weight: 600;
  }
  .again {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    color: var(--mint-ink);
  }
</style>
