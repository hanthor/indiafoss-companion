<script lang="ts">
  import type { MatrixEventRecord } from '@indiafoss/storage';
  import { getMatrix } from '$lib/matrix.svelte';

  let { event }: { event: MatrixEventRecord } = $props();

  let url = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  const isImage = $derived(event.msgtype === 'm.image');
  const sizeLabel = $derived(
    event.mediaSize
      ? `${(event.mediaSize / 1024).toFixed(event.mediaSize > 1024 * 100 ? 0 : 1)} KB`
      : '',
  );

  async function load() {
    if (url || loading) return;
    loading = true;
    error = null;
    try {
      const bytes = await getMatrix().mediaBytes(event);
      url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: event.mediaMime ?? 'application/octet-stream' }),
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (isImage) void load();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

{#if isImage}
  {#if url}
    <!-- Decrypted attachment rendered from a local object URL, never a remote src. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href={url} target="_blank" rel="noreferrer"
      ><img src={url} alt={event.body} class="attachment" /></a
    >
  {:else if error}
    <span class="attach-error">Image unavailable: {error}</span>
  {:else}
    <span class="attach-loading">Loading image…</span>
  {/if}
{:else if url}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a class="file" href={url} download={event.body}>⬇ {event.body} {sizeLabel}</a>
{:else}
  <button class="file" onclick={load} disabled={loading}>
    {loading ? 'Fetching…' : `📎 ${event.body} ${sizeLabel}`}
  </button>
  {#if error}<span class="attach-error">{error}</span>{/if}
{/if}

<style>
  .attachment {
    display: block;
    max-width: min(18rem, 100%);
    max-height: 18rem;
    border-radius: 6px;
    border: 2px solid var(--line-soft);
  }
  .file {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 2px solid var(--line-soft);
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
    text-decoration: none;
    cursor: pointer;
  }
  .attach-error {
    color: var(--danger);
    font-size: 0.8rem;
  }
  .attach-loading {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
</style>
