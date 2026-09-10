<script lang="ts">
  import { base } from '$app/paths';
  import { devroomArt } from '$lib/devroom-art';
  let { trackId, eventId }: { trackId: string; eventId: string } = $props();
  const art = $derived(eventId === 'indiafoss-2026' ? devroomArt[trackId] : undefined);
</script>

{#if art}
  <img
    class="devroom-banner"
    src="{base}/branding/2026/devroom-{art}.svg"
    alt=""
    width="960"
    height="240"
    loading="lazy"
  />
{/if}

<style>
  .devroom-banner {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 4 / 1;
    object-fit: cover;
    object-position: top;
    border-radius: var(--radius);
  }
</style>
