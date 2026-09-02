<script lang="ts">
  import { resolve } from '$app/paths';
  import { identiconSvg, shortFingerprint } from '@indiafoss/model';
  import { hydrateIdentity, identityState } from '$lib/identity.svelte';
  import { contactsState, hydrateContacts } from '$lib/contacts.svelte';

  $effect(() => {
    void hydrateIdentity();
    void hydrateContacts();
  });

  const withBadge = $derived(contactsState.contacts.filter((c) => c.fingerprint));
  let picked = $state('');
  const other = $derived(withBadge.find((c) => c.id === picked) ?? null);

  const spaced = (fp: string) =>
    fp
      .slice(0, 32)
      .replace(/(.{4})/g, '$1 ')
      .trim();
</script>

<a class="back" href={resolve('/connect')}>← Your card</a>
<div class="eyebrow">KEY BADGES · VERIFY IN PERSON</div>
<h1>Compare badges</h1>
<p class="lead">
  Hold the phones together. The badge on your screen must match the badge they see for you, and
  theirs must match what you saved. Same pixels and same digits: you scanned each other's real key.
</p>

<div class="pair">
  <section class="side" aria-label="Your key badge">
    <h2>You</h2>
    {#if identityState.identicon && identityState.fingerprint}
      <!-- eslint-disable svelte/no-at-html-tags -- SVG generated locally from a hex fingerprint -->
      <span class="big">{@html identiconSvg(identityState.fingerprint, 160)}</span>
      <!-- eslint-enable svelte/no-at-html-tags -->
      <code>{spaced(identityState.fingerprint)}</code>
    {:else}
      <p class="muted small">Preparing your key…</p>
    {/if}
  </section>

  <section class="side" aria-label="A saved contact's key badge">
    <h2>Them</h2>
    {#if withBadge.length === 0}
      <p class="muted small">
        No saved contact carries a key badge yet. Scan a companion card first.
      </p>
    {:else}
      <label>
        <span class="sr-only">Contact to compare</span>
        <select bind:value={picked} aria-label="Contact to compare">
          <option value="">Pick a contact…</option>
          {#each withBadge as c (c.id)}
            <option value={c.id}>{c.fullName}</option>
          {/each}
        </select>
      </label>
      {#if other?.fingerprint}
        <!-- eslint-disable svelte/no-at-html-tags -- SVG generated locally from a hex fingerprint -->
        <span class="big">{@html identiconSvg(other.fingerprint, 160)}</span>
        <!-- eslint-enable svelte/no-at-html-tags -->
        <code>{spaced(other.fingerprint)}</code>
        <p class="muted small">
          Ask {other.fullName} to open Connect: their badge there should read
          <b>{shortFingerprint(other.fingerprint)}</b>.
        </p>
      {/if}
    {/if}
  </section>
</div>

<style>
  .back {
    display: inline-block;
    margin-bottom: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .lead {
    color: var(--text-muted);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  @media (max-width: 480px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
  .side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    text-align: center;
  }
  .side h2 {
    margin: 0;
    font-family: var(--font-display, var(--font-mono));
    font-size: 0.8rem;
  }
  .big :global(svg) {
    width: 160px;
    height: 160px;
    image-rendering: pixelated;
    border-radius: var(--radius);
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    word-break: break-word;
  }
  select {
    width: 100%;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-size: 0.95rem;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
