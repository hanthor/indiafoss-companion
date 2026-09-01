<script lang="ts">
  import { resolve } from '$app/paths';
  import type QrScanner from 'qr-scanner';
  import { parseScannedPayload, type ScannedContact, type ScannedLocation } from '@indiafoss/model';
  import { downloadTextFile } from '$lib/calendar';
  import { eventState, loadEvent } from '$lib/event.svelte';
  import { currentLocation, hydrateLocation, setCurrentLocation } from '$lib/location.svelte';
  import { loadVenue, venueKeyForEvent, type LoadedVenue } from '$lib/venue.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  type Pending =
    { kind: 'location'; payload: ScannedLocation } | { kind: 'contact'; payload: ScannedContact };

  let videoEl: HTMLVideoElement;
  let scanner: QrScanner | null = null;
  let scanning = $state(false);
  let cameraError = $state('');
  let error = $state('');
  let status = $state('');
  let pending = $state<Pending | null>(null);
  let manualLocation = $state('');
  let manualVCard = $state('');
  let venue = $state<LoadedVenue | null>(null);

  $effect(() => {
    void loadEvent();
    void hydrateLocation();
  });

  $effect(() => {
    const eventId = eventState.bundle?.id;
    if (!eventId) return;
    void loadVenue(venueKeyForEvent(eventId)).then((v) => {
      venue = v;
    });
  });

  const venueLocations = $derived(
    venue ? Object.keys(venue.metadata.locations).sort((a, b) => a.localeCompare(b)) : [],
  );

  function labelForLocation(id: string): string {
    return id.replace(/-/g, ' ');
  }

  // Cleanly stop and release the camera when leaving the page.
  $effect(() => () => {
    scanner?.stop();
    scanner?.destroy();
    scanner = null;
  });

  function handlePayload(raw: string): void {
    error = '';
    const result = parseScannedPayload(raw);
    if (result.kind === 'error') {
      error = result.message;
      pending = null;
      return;
    }
    // Never apply automatically — always preview first.
    stopCamera();
    if (result.kind === 'location') pending = { kind: 'location', payload: result };
    else pending = { kind: 'contact', payload: result };
  }

  async function startCamera(): Promise<void> {
    cameraError = '';
    error = '';
    status = '';
    // Lazy-load the scanner engine (and request camera permission) only on demand.
    const { default: QrScannerCtor } = await import('qr-scanner');
    try {
      if (!(await QrScannerCtor.hasCamera())) {
        cameraError = 'No camera was found. Use manual entry below.';
        return;
      }
      scanner ??= new QrScannerCtor(videoEl, (result) => handlePayload(result.data), {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 5,
        returnDetailedScanResult: true,
      });
      await scanner.start();
      scanning = true;
    } catch (err) {
      scanning = false;
      cameraError =
        err instanceof Error && /denied|permission|NotAllowed/i.test(err.message)
          ? 'Camera permission was declined. Use manual entry below.'
          : 'The camera could not be started. Use manual entry below.';
    }
  }

  function stopCamera(): void {
    scanner?.stop();
    scanning = false;
  }

  function submitManualLocation(): void {
    if (!manualLocation) return;
    handlePayload(`indiafoss://location/${manualLocation}`);
  }

  function submitManualVCard(): void {
    if (!manualVCard.trim()) return;
    handlePayload(manualVCard);
  }

  async function confirmPending(): Promise<void> {
    if (!pending) return;
    if (pending.kind === 'location') {
      await setCurrentLocation(pending.payload.locationId);
      status = `Location set to ${labelForLocation(pending.payload.locationId)}.`;
    } else {
      // Contact import is local: offer to save the received card as a file.
      downloadTextFile(
        'indiafoss-scanned-contact.vcf',
        pending.payload.vcard,
        'text/vcard;charset=utf-8',
      );
      status = 'Contact card saved to your device.';
    }
    pending = null;
    manualLocation = '';
    manualVCard = '';
  }

  function cancelPending(): void {
    pending = null;
  }

  const contactPreview = $derived(pending?.kind === 'contact' ? pending.payload.profile : null);
</script>

<EventGate>
  <div class="eyebrow">SCAN · LOCAL · OPT-IN</div>
  <h1>Scan a code</h1>
  <p class="lead">
    Scan a venue location marker or another attendee's contact card. Nothing is imported until you
    confirm the preview. The camera turns on only while you are scanning.
  </p>

  <section class="camera card">
    <video bind:this={videoEl} class:hidden={!scanning} playsinline muted></video>
    {#if !scanning}
      <button class="button primary" onclick={startCamera}>Start camera</button>
    {:else}
      <button class="button secondary" onclick={stopCamera}>Stop camera</button>
    {/if}
    {#if cameraError}<p class="warning" role="status">{cameraError}</p>{/if}
    {#if currentLocation.value}
      <p class="muted small">Your current location: {labelForLocation(currentLocation.value)}</p>
    {/if}
  </section>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if status}<p class="ok" role="status">{status}</p>{/if}

  {#if pending}
    <section class="card preview" aria-live="polite">
      <h2>Confirm before importing</h2>
      {#if pending.kind === 'location'}
        <p>
          Set your current location to
          <strong>{labelForLocation(pending.payload.locationId)}</strong>?
        </p>
      {:else if contactPreview}
        <p class="muted">These fields were shared with you. Nothing is uploaded.</p>
        <dl class="fields">
          {#if contactPreview.fullName}<dt>Name</dt>
            <dd>{contactPreview.fullName}</dd>{/if}
          {#if contactPreview.organization}<dt>Organization</dt>
            <dd>{contactPreview.organization}</dd>{/if}
          {#if contactPreview.website}<dt>Website</dt>
            <dd>{contactPreview.website}</dd>{/if}
          {#if contactPreview.fossUnitedProfileUrl}<dt>FOSS United</dt>
            <dd>{contactPreview.fossUnitedProfileUrl}</dd>{/if}
          {#if contactPreview.email}<dt>Email</dt>
            <dd>{contactPreview.email}</dd>{/if}
          {#if contactPreview.phone}<dt>Phone</dt>
            <dd>{contactPreview.phone}</dd>{/if}
          {#if contactPreview.matrixId}<dt>Matrix</dt>
            <dd>{contactPreview.matrixId}</dd>{/if}
          {#each Object.entries(contactPreview.socials) as [network, url] (network)}
            <dt>{network}</dt>
            <dd>{url}</dd>
          {/each}
        </dl>
      {/if}
      <div class="preview-actions">
        <button class="button primary" onclick={confirmPending}>
          {pending.kind === 'location' ? 'Set location' : 'Save contact'}
        </button>
        <button class="button secondary" onclick={cancelPending}>Cancel</button>
      </div>
    </section>
  {/if}

  <section class="card">
    <h2>Manual entry</h2>
    <p class="muted small">No camera? Enter a location or paste a contact card instead.</p>

    <form
      class="manual"
      onsubmit={(event) => {
        event.preventDefault();
        submitManualLocation();
      }}
    >
      <label>
        Set current location
        <select bind:value={manualLocation}>
          <option value="">Choose a location…</option>
          {#each venueLocations as id (id)}
            <option value={id}>{labelForLocation(id)}</option>
          {/each}
        </select>
      </label>
      <button class="button secondary" type="submit" disabled={!manualLocation}>Preview</button>
    </form>

    <form
      class="manual"
      onsubmit={(event) => {
        event.preventDefault();
        submitManualVCard();
      }}
    >
      <label>
        Paste a vCard
        <textarea
          bind:value={manualVCard}
          rows="4"
          placeholder="BEGIN:VCARD&#10;VERSION:3.0&#10;FN:…&#10;END:VCARD"></textarea>
      </label>
      <button class="button secondary" type="submit" disabled={!manualVCard.trim()}>
        Preview contact
      </button>
    </form>
  </section>

  <p><a href={resolve('/connect')}>Share your own contact card →</a></p>
</EventGate>

<style>
  .eyebrow {
    color: var(--event-primary-dark);
    font-family: 'Space Mono', ui-monospace, monospace;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
  }
  .lead {
    color: var(--text-muted);
    line-height: 1.5;
    max-width: 42rem;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .card {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin: 1rem 0;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .camera {
    text-align: center;
  }
  video {
    display: block;
    width: min(360px, 100%);
    margin: 0 auto 0.8rem;
    border-radius: var(--radius);
    background: #000;
    aspect-ratio: 1 / 1;
    object-fit: cover;
  }
  video.hidden {
    display: none;
  }
  .fields {
    display: grid;
    grid-template-columns: 8rem 1fr;
    gap: 0.3rem 0.8rem;
    margin: 0.6rem 0;
    word-break: break-word;
  }
  .fields dt {
    font-weight: 700;
    text-transform: capitalize;
  }
  .fields dd {
    margin: 0;
  }
  .manual {
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
    margin: 0.8rem 0;
    flex-wrap: wrap;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.86rem;
    font-weight: 600;
    flex: 1 1 220px;
  }
  select,
  textarea {
    min-height: 42px;
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    background: var(--surface);
    font-weight: 400;
    font-family: inherit;
  }
  .preview-actions,
  .manual button {
    flex: 0 0 auto;
  }
  .preview-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    border-radius: 999px;
    padding: 0.55rem 1rem;
    text-decoration: none;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 700;
    border: 1px solid var(--event-primary-dark);
  }
  .button.primary {
    background: var(--event-primary);
    color: var(--event-secondary);
  }
  .button.secondary {
    background: var(--surface);
    color: var(--event-primary-dark);
    border: 1px solid color-mix(in srgb, var(--event-primary-dark) 40%, transparent);
  }
  .button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .warning {
    color: var(--warning);
    font-size: 0.85rem;
  }
  .error {
    color: var(--warning);
    border-left: 3px solid var(--warning);
    padding-left: 0.7rem;
  }
  .ok {
    color: var(--event-primary-dark);
    border-left: 3px solid var(--event-primary);
    padding-left: 0.7rem;
  }
</style>
