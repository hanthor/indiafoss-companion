<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type QrScanner from 'qr-scanner';
  import { neutrinoMatrixId, parseScannedPayload, type ScannedPayload } from '@indiafoss/model';
  import { matrixToUrl } from '@indiafoss/matrix';
  import type { ContactRecord } from '@indiafoss/storage';
  import { downloadTextFile } from '$lib/calendar';
  import { eventState, loadEvent } from '$lib/event.svelte';
  import { currentLocation, hydrateLocation, setCurrentLocation } from '$lib/location.svelte';
  import { loadVenue, venueKeyForEvent, type LoadedVenue } from '$lib/venue.svelte';
  import {
    contactFromFriend,
    contactFromMatrixId,
    contactFromVCard,
    saveContact,
  } from '$lib/contacts.svelte';
  import { hydrateMatrix, matrixState } from '$lib/matrix.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  type Pending = Exclude<ScannedPayload, { kind: 'error' }>;

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
    void hydrateMatrix();
  });

  // Deep links (indiafoss://location/…, indiafoss://friend?…) arrive as ?payload=.
  $effect(() => {
    const payload = page.url.searchParams.get('payload');
    if (payload) handlePayload(payload);
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
    pending = result;
  }

  /** Contact draft for any people-shaped payload; saved only after confirmation. */
  const draft = $derived.by((): ContactRecord | null => {
    const eventId = eventState.bundle?.id;
    if (!pending) return null;
    if (pending.kind === 'contact')
      return contactFromVCard(pending.profile, pending.vcard, eventId);
    if (pending.kind === 'friend') return contactFromFriend(pending.friend, eventId);
    if (pending.kind === 'matrix-user') return contactFromMatrixId(pending.userId, eventId);
    return null;
  });

  const locationKnown = $derived(
    pending?.kind === 'location' && venue
      ? Boolean(venue.metadata.locations[pending.locationId])
      : false,
  );

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
      if (!locationKnown) {
        error = 'This location marker is not part of the venue map.';
        return;
      }
      await setCurrentLocation(pending.locationId);
      status = `Location set to ${labelForLocation(pending.locationId)}.`;
    } else if (draft) {
      // Contact import is local: keep it in the on-device contact list (unverified).
      await saveContact(draft);
      status = `Saved ${draft.fullName} to your contacts. Identities stay unverified until checked in a Matrix client.`;
    }
    pending = null;
    manualLocation = '';
    manualVCard = '';
  }

  function downloadDraft(): void {
    if (!draft) return;
    downloadTextFile('indiafoss-scanned-contact.vcf', draft.vcard, 'text/vcard;charset=utf-8');
  }

  function cancelPending(): void {
    pending = null;
  }

  const contactPreview = $derived(draft);
</script>

<EventGate>
  <div class="eyebrow">SCAN · LOCAL · OPT-IN</div>
  <h1>Scan a code</h1>
  <p class="lead">
    Scan a venue location marker, another attendee's contact or friend card, a Matrix link or a
    ticket. Nothing is imported, joined or sent until you confirm the preview. The camera turns on
    only while you are scanning.
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
          <strong>{labelForLocation(pending.locationId)}</strong>?
        </p>
        {#if venue && !locationKnown}
          <p class="warning">This marker does not match any location on the venue map.</p>
        {/if}
      {:else if pending.kind === 'ticket'}
        <p>Ticket reference <code>{pending.ticketRef}</code></p>
        <p class="muted small">
          A ticket QR only carries a ticket id. It is an event-scoped reference — not an identity,
          not a Matrix id, and not proof that whoever holds it owns it. Ask the attendee for their
          contact or friend card instead.
        </p>
      {:else if pending.kind === 'matrix-room'}
        <p>Matrix room <code>{pending.idOrAlias}</code></p>
        <p class="muted small">Joining reveals your Matrix id to the room's members.</p>
      {:else if contactPreview}
        <p class="muted">These fields were shared with you. Nothing is uploaded.</p>
        <p class="unverified">
          Unverified — a QR code exchanges identifiers, it does not prove who someone is.
        </p>
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
          {#if contactPreview.neutrinoServerName}<dt>Neutrino peer</dt>
            <dd>
              <code>{contactPreview.neutrinoServerName}</code>
              <span class="muted small"
                >P2P Matrix id {neutrinoMatrixId(contactPreview.neutrinoServerName)}</span
              >
            </dd>{/if}
          {#if contactPreview.ticketRef}<dt>Ticket ref</dt>
            <dd><code>{contactPreview.ticketRef}</code></dd>{/if}
          {#each Object.entries(contactPreview.socials) as [network, url] (network)}
            <dt>{network}</dt>
            <dd>{url}</dd>
          {/each}
        </dl>
      {/if}
      <div class="preview-actions">
        {#if pending.kind === 'location'}
          <button
            class="button primary"
            onclick={confirmPending}
            disabled={venue !== null && !locationKnown}
          >
            Set location
          </button>
        {:else if pending.kind === 'matrix-room'}
          <a
            class="button primary"
            href={resolve(`/chat?join=${encodeURIComponent(pending.idOrAlias)}`)}
          >
            Join in Chat
          </a>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a class="button secondary" href={matrixToUrl(pending.idOrAlias)} rel="noreferrer"
            >Open in Element</a
          >
        {:else if pending.kind !== 'ticket'}
          <button class="button primary" onclick={confirmPending}>Save contact</button>
          {#if contactPreview?.matrixId}
            {#if matrixState.status !== 'signed-out'}
              <a
                class="button secondary"
                href={resolve(`/chat?dm=${encodeURIComponent(contactPreview.matrixId)}`)}
              >
                Message
              </a>
            {/if}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a class="button secondary" href={matrixToUrl(contactPreview.matrixId)} rel="noreferrer"
              >Open in Element</a
            >
          {:else if contactPreview?.neutrinoServerName}
            <!-- eslint-disable svelte/no-navigation-without-resolve -->
            <a
              class="button secondary"
              href={matrixToUrl(neutrinoMatrixId(contactPreview.neutrinoServerName))}
              rel="noreferrer">Open P2P id in a Neutrino client</a
            >
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          {/if}
          <button class="button secondary" onclick={downloadDraft}>Download .vcf</button>
        {/if}
        <button class="button secondary" onclick={cancelPending}>
          {pending.kind === 'ticket' ? 'Dismiss' : 'Cancel'}
        </button>
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
        Paste a vCard, friend card, Matrix id or link
        <textarea
          bind:value={manualVCard}
          rows="4"
          placeholder="BEGIN:VCARD… · indiafoss://friend?v=1… · @alice:matrix.org · https://matrix.to/#/…"
        ></textarea>
      </label>
      <button class="button secondary" type="submit" disabled={!manualVCard.trim()}>
        Preview
      </button>
    </form>
  </section>

  <p><a href={resolve('/connect')}>Share your own contact card →</a></p>
  <p><a href={resolve('/chat')}>Open chat →</a></p>
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
  .unverified {
    background: color-mix(in srgb, var(--warning) 14%, var(--surface));
    border-radius: var(--radius);
    padding: 0.4rem 0.7rem;
    font-size: 0.85rem;
  }
  code {
    font-size: 0.8rem;
    overflow-wrap: anywhere;
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
