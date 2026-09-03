<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type QrScanner from 'qr-scanner';
  import {
    contactDeepLinks,
    identiconSvg,
    keyFingerprint,
    neutrinoMatrixId,
    parseScannedPayload,
    shortFingerprint,
    verifyFriendPayload,
    verifyVCardSignature,
    formatPublicKey,
    type FriendSignatureState,
    type ScannedPayload,
  } from '@indiafoss/model';
  import { computeNowState } from '@indiafoss/schedule';
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
    saveScannedContact,
  } from '$lib/contacts.svelte';
  import { features } from '$lib/features.svelte';
  import { reconcileContact } from '$lib/contact-continuity';
  import { contactsState, hydrateContacts } from '$lib/contacts.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';

  type Pending = Exclude<ScannedPayload, { kind: 'error' }>;

  let videoEl = $state<HTMLVideoElement | undefined>(undefined);
  let scanner: QrScanner | null = null;
  let scanning = $state(false);
  let cameraError = $state('');
  /** True once permission was refused, which is the only case that needs a button. */
  let cameraBlocked = $state(false);
  let cameraStarting = $state(true);
  let error = $state('');
  let status = $state('');
  let pending = $state<Pending | null>(null);
  /** Signature check + key badge for a scanned friend card. */
  let cardIdentity = $state<{
    signature: FriendSignatureState;
    fingerprint?: string;
    publicKey?: string;
  } | null>(null);
  let manualLocation = $state('');
  let manualVCard = $state('');
  /** Manual entry stays tucked away unless the camera cannot be used. */
  let manualOpen = $state(false);
  $effect(() => {
    if (cameraBlocked || cameraError) manualOpen = true;
  });
  let venue = $state<LoadedVenue | null>(null);

  $effect(() => {
    void loadEvent();
    void hydrateLocation();
    void hydrateContacts();
  });

  // Scanning is the reason people open this screen, so ask for the camera at
  // once instead of behind a button. A refusal falls back to manual entry.
  // The <video> only exists once the event bundle has loaded (EventGate), so
  // start when it is bound rather than on mount; otherwise qr-scanner gets an
  // undefined element and the camera "could not be started".
  let autoStarted = false;
  $effect(() => {
    if (autoStarted || !videoEl) return;
    autoStarted = true;
    if (sharedPayload()) {
      cameraStarting = false;
      return;
    }
    void startCamera();
  });

  // Deep links (indiafoss://location/…, indiafoss://friend?…) arrive as ?payload=;
  // the PWA share target delivers ?url= / ?text= (Web Share Target, GET).
  function sharedPayload(): string | null {
    const q = page.url.searchParams;
    return q.get('payload') || q.get('url') || q.get('text') || null;
  }
  $effect(() => {
    const payload = sharedPayload();
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
    cardIdentity = null;
    if (result.kind === 'friend') {
      void verifyFriendPayload(raw.trim()).then(async ({ signature, publicKey }) => {
        cardIdentity = {
          signature,
          fingerprint: publicKey ? await keyFingerprint(publicKey) : undefined,
          publicKey: publicKey ? formatPublicKey(publicKey) : undefined,
        };
      });
    } else if (result.kind === 'contact') {
      void verifyVCardSignature(result.vcard).then(async ({ signature, publicKey }) => {
        // A card from any other app is simply unsigned; only a companion card carries a key.
        if (!publicKey) return;
        cardIdentity = {
          signature,
          fingerprint: await keyFingerprint(publicKey),
          publicKey: formatPublicKey(publicKey),
        };
      });
    }
  }

  /** The session running right now (or by ?now= developer time) and where you are. */
  const meeting = $derived.by(() => {
    const bundle = eventState.bundle;
    if (!bundle) return {};
    const nowState = computeNowState(bundle, new Date().toISOString());
    return {
      activityId: nowState.current[0]?.id,
      locationId: currentLocation.value ?? nowState.current[0]?.locationId,
    };
  });

  /** Contact draft for any people-shaped payload; saved only after confirmation. */
  const draft = $derived.by((): ContactRecord | null => {
    const eventId = eventState.bundle?.id;
    if (!pending) return null;
    if (pending.kind === 'contact')
      return contactFromVCard(
        pending.profile,
        pending.vcard,
        eventId,
        cardIdentity ?? undefined,
        meeting,
      );
    if (pending.kind === 'friend') {
      return contactFromFriend(pending.friend, eventId, cardIdentity ?? undefined, meeting);
    }
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
    cameraBlocked = false;
    cameraStarting = true;
    error = '';
    status = '';
    // Lazy-load the scanner engine (and request camera permission) only on demand.
    const { default: QrScannerCtor } = await import('qr-scanner');
    try {
      if (!(await QrScannerCtor.hasCamera())) {
        cameraError = 'No camera was found. Enter the code by hand below.';
        cameraStarting = false;
        return;
      }
      if (!videoEl) throw new Error('camera preview not ready');
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
      console.warn('camera start failed', err);
      const denied = err instanceof Error && /denied|permission|NotAllowed/i.test(err.message);
      cameraBlocked = true;
      cameraError = denied
        ? 'Camera permission was declined. Allow it in the system settings for this app, then tap Allow camera.'
        : 'The camera could not be started. Try again, or enter the code by hand below.';
    } finally {
      cameraStarting = false;
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
      const result = await saveScannedContact(draft);
      status =
        result.outcome === 'updated'
          ? `Updated ${result.contact.fullName} (met ${result.contact.metCount ?? 1} times). Identities stay unverified until compared in person.`
          : result.outcome === 'key-changed'
            ? `Saved ${result.contact.fullName} as a new entry: the card's key differs from the one you saved before, so the earlier contact was kept. Compare key badges in person before trusting either.`
            : `Saved ${result.contact.fullName} to your contacts. Identities stay unverified until compared in person.`;
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
  /** What saving this card would do against the existing contact list (key continuity). */
  const continuity = $derived(draft ? reconcileContact(draft, contactsState.contacts) : null);
</script>

<EventGate>
  <div class="eyebrow">SCAN · LOCAL · OPT-IN</div>
  <h1>Scan a code</h1>
  <p class="lead">
    Point at a room marker, a contact card or a Matrix link. Nothing is saved until you confirm.
  </p>

  <section class="camera card">
    <!-- The preview is always laid out (never display:none): qr-scanner sizes its
         scan region from the video, and Android Chrome shows a black frame for a
         stream that started while the element was hidden. -->
    <div class="viewfinder" class:live={scanning} class:idle={!scanning}>
      <video bind:this={videoEl} playsinline muted></video>
      <div class="frame" aria-hidden="true">
        <span class="corner tl"></span><span class="corner tr"></span>
        <span class="corner bl"></span><span class="corner br"></span>
        {#if scanning}<span class="beam"></span>{/if}
      </div>
      {#if scanning}
        <p class="hintline">Point at a QR code</p>
      {:else if cameraStarting}
        <p class="hintline">Opening the camera…</p>
      {/if}
    </div>
    {#if scanning}
      <button class="button secondary" onclick={stopCamera}>Stop camera</button>
    {:else if cameraStarting}
      <p class="muted small">Opening the camera…</p>
    {:else if cameraBlocked}
      <button class="button primary" onclick={startCamera}>Allow camera</button>
    {:else}
      <button class="button primary" onclick={startCamera}>Start camera</button>
    {/if}
    {#if cameraError}<p class="warning">{cameraError}</p>{/if}
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
        {#if continuity?.outcome === 'key-changed'}
          <p class="warning" role="alert">
            You already have {continuity.previous?.fullName} saved with a different key badge. This card
            will be kept as a separate entry; compare badges in person before trusting either.
          </p>
        {:else if continuity?.outcome === 'updated'}
          <p class="muted small">
            Already in your contacts (met {continuity.previous?.metCount ?? 1} time{(continuity
              .previous?.metCount ?? 1) === 1
              ? ''
              : 's'}); saving updates the entry.
          </p>
        {/if}
        <p class="muted">These fields were shared with you. Nothing is uploaded.</p>
        <p class="unverified">
          Unverified — a QR code exchanges identifiers, it does not prove who someone is.
        </p>
        {#if pending.kind === 'friend'}
          <div class="handshake">
            {#if cardIdentity?.fingerprint}
              <!-- eslint-disable-next-line svelte/no-at-html-tags (SVG generated locally from a hex fingerprint) -->
              <span class="identicon">{@html identiconSvg(cardIdentity.fingerprint, 64)}</span>
            {/if}
            <div>
              {#if !cardIdentity}
                <span class="muted small">Checking signature…</span>
              {:else if cardIdentity.signature === 'valid'}
                <strong class="sig-ok">✔ Signed card</strong>
                <span class="muted small">
                  Badge <code>{shortFingerprint(cardIdentity.fingerprint ?? '')}</code> — ask them to
                  show their badge on the Connect screen; if it matches, you scanned their device's key.
                </span>
              {:else if cardIdentity.signature === 'invalid'}
                <strong class="sig-bad">✖ Signature does not match</strong>
                <span class="muted small"
                  >The card was altered or re-encoded. Ask for a fresh code.</span
                >
              {:else}
                <span class="muted small">Unsigned card (older app or no WebCrypto).</span>
              {/if}
            </div>
          </div>
          {#if meeting.activityId}
            <p class="muted small">
              You're meeting during
              <strong
                >{eventState.bundle?.activities.find((a) => a.id === meeting.activityId)
                  ?.title}</strong
              >; that context is saved with the contact.
            </p>
          {/if}
        {/if}
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
        {#if contactDeepLinks(contactPreview).length > 0}
          <p class="muted small">
            Tap to reach them (opens the app or site, nothing is sent automatically):
          </p>
          <SocialLinks links={contactDeepLinks(contactPreview)} />
        {/if}
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
          <!-- Public Matrix rooms live in a real Matrix client, not in the mesh chat. -->
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a class="button primary" href={matrixToUrl(pending.idOrAlias)} rel="noreferrer"
            >Open in Element</a
          >
        {:else if pending.kind !== 'ticket'}
          <button class="button primary" onclick={confirmPending}>Save contact</button>
          {#if contactPreview?.neutrinoServerName && features.chat}
            <a
              class="button secondary"
              href={resolve(
                `/chat?dm=${encodeURIComponent(neutrinoMatrixId(contactPreview.neutrinoServerName))}`,
              )}
            >
              Message on mesh
            </a>
          {/if}
          {#if contactPreview?.matrixId}
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

  <details class="card manualentry" bind:open={manualOpen}>
    <summary>Enter a code by hand</summary>
    <p class="muted small">Only if the camera cannot: pick a location, or paste a card or link.</p>

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
        Preview contact
      </button>
    </form>
  </details>

  <p><a href={resolve('/connect')}>Share your own contact card →</a></p>
  {#if features.chat}
    <p><a href={resolve('/chat')}>Open chat →</a></p>
  {/if}
</EventGate>

<style>
  .camera {
    text-align: center;
  }
  .viewfinder {
    position: relative;
    width: min(360px, 100%);
    margin: 0 auto 0.8rem;
    border-radius: var(--radius);
    background: #000;
    aspect-ratio: 1 / 1;
    overflow: hidden;
  }
  .viewfinder video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #000;
  }
  .viewfinder.idle video {
    opacity: 0;
  }
  /* qr-scanner appends its own highlight box next to the video. */
  .viewfinder :global(.scan-region-highlight) {
    border-radius: 6px;
  }
  .frame {
    position: absolute;
    inset: 12%;
    pointer-events: none;
  }
  .corner {
    position: absolute;
    width: 1.6rem;
    height: 1.6rem;
    border: 3px solid var(--mint);
  }
  .corner.tl {
    top: 0;
    left: 0;
    border-right: 0;
    border-bottom: 0;
    border-top-left-radius: 6px;
  }
  .corner.tr {
    top: 0;
    right: 0;
    border-left: 0;
    border-bottom: 0;
    border-top-right-radius: 6px;
  }
  .corner.bl {
    bottom: 0;
    left: 0;
    border-right: 0;
    border-top: 0;
    border-bottom-left-radius: 6px;
  }
  .corner.br {
    bottom: 0;
    right: 0;
    border-left: 0;
    border-top: 0;
    border-bottom-right-radius: 6px;
  }
  .idle .corner {
    opacity: 0.35;
  }
  .beam {
    position: absolute;
    left: 6%;
    right: 6%;
    top: 0;
    height: 2px;
    background: var(--mint);
    box-shadow: 0 0 8px var(--mint);
    animation: sweep 2.2s ease-in-out infinite alternate;
  }
  @keyframes sweep {
    from {
      top: 0;
    }
    to {
      top: calc(100% - 2px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .beam {
      animation: none;
      top: 50%;
    }
  }
  .hintline {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0.5rem;
    margin: 0;
    color: var(--on-ink);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
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
  .manualentry summary {
    cursor: pointer;
    font-weight: 600;
  }
  .manualentry > p {
    margin-top: 0.5rem;
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
  .warning {
    color: var(--warning);
    font-size: 0.85rem;
  }
  .handshake {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin: 0.5rem 0;
  }
  .handshake div {
    display: grid;
    gap: 0.15rem;
  }
  .identicon :global(svg) {
    display: block;
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .sig-ok {
    color: var(--mint-ink);
  }
  .sig-bad {
    color: var(--danger);
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
