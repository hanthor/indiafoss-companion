<script lang="ts">
  import { signedAttendeeVCard } from '@indiafoss/model';
  import { hydrateProfile, profileState } from '$lib/profile.svelte';
  import { hydrateIdentity, identityState } from '$lib/identity.svelte';

  /**
   * The attendee's own card, freshly issued, for the "now show yours" half of
   * an exchange. Each render is a new signed rendering, so the code on screen
   * is never older than the moment it appeared.
   */
  let { size = 288 }: { size?: number } = $props();

  let dataUrl = $state<string | null>(null);
  let failed = $state(false);

  $effect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([hydrateProfile(), hydrateIdentity()]);
      if (cancelled) return;
      try {
        const value = await signedAttendeeVCard(
          profileState.profile,
          profileState.selection,
          identityState.pair,
        );
        const QRCode = await import('qrcode');
        const url = await QRCode.toDataURL(value, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: size * 1.5,
          color: { dark: '#141414', light: '#ffffff' },
        });
        if (!cancelled) dataUrl = url;
      } catch {
        if (!cancelled) failed = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

{#if dataUrl}
  <img
    class="qr"
    src={dataUrl}
    alt="QR code of your contact card"
    width={size}
    height={size}
    data-testid="my-card-qr"
  />
{:else if failed}
  <p class="muted small">Your card could not be built. Open Connect to check it.</p>
{:else}
  <div
    class="qr placeholder"
    style:width="{size}px"
    style:height="{size}px"
    aria-hidden="true"
  ></div>
{/if}

<style>
  .qr {
    display: block;
    background: var(--qr-plate);
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    image-rendering: pixelated;
    box-sizing: content-box;
  }
  .placeholder {
    image-rendering: auto;
  }
</style>
