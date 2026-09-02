<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    attendeeProfileToVCard,
    contactDeepLinks,
    encodeFriendPayload,
    encodeSignedFriendPayload,
    shortFingerprint,
    isMatrixUserId,
    isNeutrinoServerName,
    isTicketRef,
    neutrinoMatrixId,
    type AttendeeSocial,
    type FriendPayload,
  } from '@indiafoss/model';
  import {
    MatrixClient,
    matrixToUrl,
    readExtendedProfile,
    supportsExtendedProfiles,
    writeExtendedProfile,
  } from '@indiafoss/matrix';
  import { CompanionStorage } from '@indiafoss/storage';
  import { downloadTextFile } from '$lib/calendar';
  import { eventState } from '$lib/event.svelte';
  import { hydrateMatrix, matrixState } from '$lib/matrix.svelte';
  import { contactsState, deleteContact, hydrateContacts } from '$lib/contacts.svelte';
  import { hydrateIdentity, identityState } from '$lib/identity.svelte';
  import { identiconSvg } from '@indiafoss/model';
  import {
    hydrateProfile,
    profileState,
    saveProfile,
    saveSelection,
    setSocial,
    setSocialSelection,
    MESSENGERS,
    SOCIAL_PLACEHOLDER,
    SOCIALS,
    usernameFromProfileUrl,
  } from '$lib/profile.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  let vcard = $state('');
  let qrDataUrl = $state<string | null>(null);
  let message = $state('');
  let generating = $state(false);
  /** Tier 1 = universal vCard; tier 2 = companion friend card with messaging identities. */
  let cardMode = $state<'vcard' | 'friend'>('vcard');
  let publishStatus = $state('');
  let publishSupported = $state<boolean | null>(null);

  $effect(() => {
    void hydrateProfile();
    void hydrateContacts();
    void hydrateMatrix();
    void hydrateIdentity();
  });

  const matrixIdValid = $derived(
    !profileState.profile.matrixId?.trim() || isMatrixUserId(profileState.profile.matrixId.trim()),
  );
  const neutrinoValid = $derived(
    !profileState.profile.neutrinoServerName?.trim() ||
      isNeutrinoServerName(profileState.profile.neutrinoServerName.trim()),
  );
  const ticketValid = $derived(
    !profileState.profile.ticketRef?.trim() || isTicketRef(profileState.profile.ticketRef.trim()),
  );
  const identitiesValid = $derived(matrixIdValid && neutrinoValid && ticketValid);

  async function friendCard(): Promise<string> {
    const p = profileState.profile;
    const sel = profileState.selection;
    const payload: FriendPayload = {
      version: 1,
      eventId: eventState.bundle?.id,
      ticketRef: sel.ticketRef ? p.ticketRef : undefined,
      fossUnitedProfileUrl: sel.fossUnitedProfileUrl ? p.fossUnitedProfileUrl : undefined,
      matrixId: sel.matrixId ? p.matrixId : undefined,
      neutrinoServerName: sel.neutrinoServerName ? p.neutrinoServerName : undefined,
      fullName: sel.name ? p.fullName : undefined,
      organization: sel.organization ? p.organization : undefined,
      website: sel.website ? p.website : undefined,
      socials: Object.fromEntries(
        Object.entries(p.socials).filter(([k, v]) => v && sel.socials[k as AttendeeSocial]),
      ),
    };
    // Signed with this device's handshake key when WebCrypto is available.
    return identityState.pair
      ? encodeSignedFriendPayload(payload, identityState.pair)
      : encodeFriendPayload(payload);
  }

  function useSignedInMatrixId(): void {
    if (matrixState.userId) profileState.profile.matrixId = matrixState.userId;
  }

  async function sessionClient(): Promise<MatrixClient | null> {
    const raw = await new CompanionStorage().getSetting('matrix-session');
    if (!raw) return null;
    const session = JSON.parse(raw) as { homeserver: string; accessToken: string };
    return new MatrixClient(session.homeserver, session.accessToken);
  }

  async function checkPublish(): Promise<void> {
    const client = await sessionClient();
    if (!client || !matrixState.userId) return;
    publishSupported = await supportsExtendedProfiles(client);
    if (!publishSupported) {
      publishStatus = 'This homeserver does not support extended profile fields (MSC4133).';
      return;
    }
    const current = await readExtendedProfile(client, matrixState.userId);
    publishStatus = current.profileUrl
      ? `Currently published: ${current.profileUrl}`
      : 'Supported. Nothing published yet.';
  }

  async function publish(clear: boolean): Promise<void> {
    const client = await sessionClient();
    if (!client || !matrixState.userId) return;
    publishStatus = 'Publishing…';
    try {
      const url = profileState.profile.fossUnitedProfileUrl;
      await writeExtendedProfile(client, matrixState.userId, {
        profileUrl: clear ? undefined : url,
        username: clear ? undefined : (usernameFromProfileUrl(url ?? '') ?? undefined),
      });
      publishStatus = clear
        ? 'Association removed from your Matrix profile.'
        : 'Published to your Matrix profile.';
    } catch (error) {
      publishStatus = error instanceof Error ? error.message : String(error);
    }
  }

  const profileUsername = $derived(
    profileState.profile.fossUnitedProfileUrl
      ? usernameFromProfileUrl(profileState.profile.fossUnitedProfileUrl)
      : null,
  );

  async function generateCard(): Promise<void> {
    generating = true;
    message = '';
    if (!identitiesValid) {
      message = 'Fix the highlighted identity fields first.';
      generating = false;
      return;
    }
    profileState.profile.neutrinoServerName =
      profileState.profile.neutrinoServerName?.trim().toLowerCase() || undefined;
    await saveProfile();
    await saveSelection();
    const value =
      cardMode === 'vcard'
        ? attendeeProfileToVCard(profileState.profile, profileState.selection)
        : await friendCard();
    if (new TextEncoder().encode(value).length > 1500) {
      message = 'This card is too large for reliable QR scanning. Remove optional fields.';
      vcard = value;
      qrDataUrl = null;
      generating = false;
      return;
    }
    vcard = value;
    const QRCode = await import('qrcode');
    qrDataUrl = await QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#18222a', light: '#ffffff' },
    });
    message = 'Your card is generated locally. It has not been uploaded.';
    generating = false;
  }

  function downloadCard(): void {
    if (!vcard) return;
    downloadTextFile('indiafoss-contact.vcf', vcard, 'text/vcard;charset=utf-8');
    message = 'vCard downloaded.';
  }

  async function shareCard(): Promise<void> {
    if (!vcard || typeof navigator.share !== 'function') {
      downloadCard();
      return;
    }
    try {
      const file = new File([vcard], 'indiafoss-contact.vcf', { type: 'text/vcard' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My IndiaFOSS contact' });
      } else {
        await navigator.share({ title: 'My IndiaFOSS contact', text: vcard });
      }
      message = 'Share sheet opened.';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      downloadCard();
    }
  }

  function toggleSocial(network: AttendeeSocial, event: Event): void {
    setSocialSelection(network, (event.currentTarget as HTMLInputElement).checked);
  }
</script>

<EventGate>
  <div class="eyebrow">LOCAL · OPT-IN · OFFLINE</div>
  <h1>Share your contact</h1>
  <p class="lead">
    Use your existing FOSS United profile as your public identity, then choose exactly what this
    device shares. Nothing is uploaded by this page.
  </p>

  <section class="profile-link card">
    <div>
      <h2>FOSS United profile</h2>
      <p class="muted">Add or update your socials on FOSS United first.</p>
    </div>
    <!-- external profile editor -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a class="button secondary" href="https://fossunited.org/me" rel="noreferrer">Edit profile ↗</a>
  </section>

  <form
    class="form"
    onsubmit={(event) => {
      event.preventDefault();
      void generateCard();
    }}
  >
    <label>
      Full name
      <input required bind:value={profileState.profile.fullName} autocomplete="name" />
    </label>
    <label>
      FOSS United profile URL
      <input
        type="url"
        placeholder="https://fossunited.org/u/your_username"
        bind:value={profileState.profile.fossUnitedProfileUrl}
        autocomplete="url"
      />
    </label>
    {#if profileState.profile.fossUnitedProfileUrl && !profileUsername}
      <p class="warning">Use a public URL in the form https://fossunited.org/u/username.</p>
    {/if}
    {#if profileUsername}<p class="muted small">Profile handle: @{profileUsername}</p>{/if}

    <div class="two-col">
      <label
        >Organization <input
          bind:value={profileState.profile.organization}
          autocomplete="organization"
        /></label
      >
      <label
        >Website <input
          type="url"
          bind:value={profileState.profile.website}
          autocomplete="url"
        /></label
      >
      <label
        >Email <input
          type="email"
          bind:value={profileState.profile.email}
          autocomplete="email"
        /></label
      >
      <label
        >Phone <input
          type="tel"
          bind:value={profileState.profile.phone}
          autocomplete="tel"
        /></label
      >
    </div>

    <fieldset>
      <legend>Messaging identities (optional, off by default in the card)</legend>
      <label>
        Matrix ID
        <input
          placeholder="@you:example.org"
          bind:value={profileState.profile.matrixId}
          aria-invalid={!matrixIdValid}
        />
        {#if !matrixIdValid}<span class="warning">Must look like @user:server</span>{/if}
        {#if matrixState.userId && matrixState.userId !== profileState.profile.matrixId}
          <button type="button" class="linkbtn" onclick={useSignedInMatrixId}>
            Use signed-in account {matrixState.userId}
          </button>
        {/if}
      </label>
      <label>
        Neutrino peer identity (server name)
        <input
          placeholder="64 hex characters from the Neutrino app"
          bind:value={profileState.profile.neutrinoServerName}
          aria-invalid={!neutrinoValid}
          spellcheck="false"
        />
        {#if !neutrinoValid}<span class="warning">Must be 64 hexadecimal characters</span>{/if}
        {#if neutrinoValid && profileState.profile.neutrinoServerName}
          <span class="muted small">
            Derived P2P Matrix id: {neutrinoMatrixId(profileState.profile.neutrinoServerName)} — kept
            separate from your Matrix ID; the two are not interchangeable.
          </span>
        {/if}
      </label>
      <label>
        Ticket reference
        <input
          placeholder="ticket::<id>"
          bind:value={profileState.profile.ticketRef}
          aria-invalid={!ticketValid}
          spellcheck="false"
        />
        {#if !ticketValid}<span class="warning">Format is ticket::&lt;id&gt;</span>{/if}
        <span class="muted small"
          >Event-scoped correlation key only — never an identity or a login.</span
        >
      </label>
    </fieldset>

    <fieldset>
      <legend>Share these fields</legend>
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.name} /> Name</label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.organization} /> Organization</label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.website} /> Website</label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.fossUnitedProfileUrl} /> FOSS United
        profile</label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.matrixId} /> Matrix ID
        <span class="muted">(off by default)</span></label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.neutrinoServerName} /> Neutrino
        peer identity <span class="muted">(off by default)</span></label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.ticketRef} /> Ticket reference
        <span class="muted">(off by default; never in a public card)</span></label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.email} /> Email
        <span class="muted">(off by default)</span></label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={profileState.selection.phone} /> Phone
        <span class="muted">(off by default)</span></label
      >
    </fieldset>

    <fieldset>
      <legend>Public social links and messengers</legend>
      <p class="muted small">
        Telegram, WhatsApp and Signal become tap-to-message links for whoever scans your card. They
        are off by default like every other field.
      </p>
      <div class="socials">
        {#each SOCIALS as network (network)}
          <label class="social-row">
            <span>{network}</span>
            <input
              type={MESSENGERS.includes(network) ? 'text' : 'url'}
              placeholder={SOCIAL_PLACEHOLDER[network] ?? `https://${network}.com/…`}
              value={profileState.profile.socials[network] ?? ''}
              oninput={(event) => setSocial(network, event.currentTarget.value)}
            />
            <input
              type="checkbox"
              aria-label={`Share ${network}`}
              checked={profileState.selection.socials[network] ?? false}
              onchange={(event) => toggleSocial(network, event)}
            />
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>Card format</legend>
      <label class="check">
        <input type="radio" name="card-mode" value="vcard" bind:group={cardMode} />
        Standard vCard <span class="muted">(any camera app can import it)</span>
      </label>
      <label class="check">
        <input type="radio" name="card-mode" value="friend" bind:group={cardMode} />
        Companion friend card
        <span class="muted">(Matrix / Neutrino aware, signed; needs this app)</span>
      </label>
      {#if identityState.identicon && identityState.fingerprint}
        <div class="badge-row">
          <!-- Deterministic pixel badge derived from this device's signing key. -->
          <!-- eslint-disable-next-line svelte/no-at-html-tags (SVG generated locally from a hex fingerprint) -->
          <span class="identicon">{@html identityState.identicon}</span>
          <span class="muted small">
            Your key badge <code>{shortFingerprint(identityState.fingerprint)}</code>. When someone
            scans your friend card they see this same badge — a quick visual check that the card
            came from your device. It is a handshake, not proof of identity.
          </span>
        </div>
      {/if}
    </fieldset>

    <button class="button primary" type="submit" disabled={generating || !identitiesValid}>
      {generating ? 'Generating…' : 'Generate my QR card'}
    </button>
  </form>

  {#if qrDataUrl}
    <section class="card result" aria-live="polite">
      <h2>Show this QR to someone</h2>
      <p class="muted">
        Only the selected fields are encoded.
        {cardMode === 'vcard'
          ? 'They can scan it with any camera.'
          : 'They scan it with the IndiaFOSS Companion scanner; it shows as unverified.'}
      </p>
      <img src={qrDataUrl} alt="Your selected contact details as a QR code" />
      <div class="result-actions">
        {#if cardMode === 'vcard'}
          <button class="button secondary" onclick={shareCard}>Share vCard</button>
          <button class="button secondary" onclick={downloadCard}>Download .vcf</button>
        {:else}
          <button class="button secondary" onclick={() => navigator.clipboard?.writeText(vcard)}>
            Copy friend link
          </button>
        {/if}
      </div>
      <details>
        <summary>Preview {cardMode === 'vcard' ? 'vCard' : 'friend card'} data</summary>
        <pre>{vcard}</pre>
      </details>
    </section>
  {/if}
  {#if message}<p class="muted" role="status">{message}</p>{/if}

  {#if matrixState.userId}
    <section class="card">
      <h2>Matrix profile association</h2>
      <p class="muted small">
        Optionally publish your FOSS United profile URL on your Matrix profile ({matrixState.userId})
        using MSC4133 extended profile fields. Association is a claim you make, not authentication;
        Matrix verification remains the authenticity mechanism.
      </p>
      <div class="result-actions left">
        <button class="button secondary" onclick={checkPublish}>Check support</button>
        <button
          class="button primary"
          onclick={() => publish(false)}
          disabled={publishSupported === false || !profileState.profile.fossUnitedProfileUrl}
        >
          Publish
        </button>
        <button
          class="button secondary"
          onclick={() => publish(true)}
          disabled={publishSupported === false}
        >
          Remove
        </button>
      </div>
      {#if publishStatus}<p class="muted small" role="status">{publishStatus}</p>{/if}
    </section>
  {/if}

  <section class="card">
    <h2>Saved contacts ({contactsState.contacts.length})</h2>
    <p class="muted small">
      People you scanned. All identities stay <em>unverified</em> until checked in a Matrix client.
    </p>
    {#if contactsState.contacts.length === 0}
      <p class="muted">No contacts yet — <a href={resolve('/scan')}>scan a code</a>.</p>
    {:else}
      <ul class="contacts">
        {#each contactsState.contacts as c (c.id)}
          <li>
            <div class="who">
              <strong>{c.fullName}</strong>
              {#if c.organization}<span class="muted small">{c.organization}</span>{/if}
              {#if c.fossUnitedProfileUrl}<span class="small">{c.fossUnitedProfileUrl}</span>{/if}
              {#if c.matrixId}<span class="small">Matrix: {c.matrixId}</span>{/if}
              {#if c.neutrinoServerName}
                <span class="small mono"
                  >Neutrino: {c.neutrinoServerName.slice(0, 16)}… → {neutrinoMatrixId(
                    c.neutrinoServerName,
                  ).slice(0, 22)}…</span
                >
              {/if}
              {#if c.metActivityId}
                <span class="small muted">
                  Met during
                  <a href={resolve(`/activity/${c.metActivityId}`)}
                    >{eventState.bundle?.activities.find((a) => a.id === c.metActivityId)?.title ??
                      'a session'}</a
                  >
                </span>
              {/if}
              {#if c.signature}
                <span
                  class="small"
                  class:sig-ok={c.signature === 'valid'}
                  class:sig-bad={c.signature === 'invalid'}
                >
                  {c.signature === 'valid'
                    ? '✔ signed card'
                    : c.signature === 'invalid'
                      ? '✖ bad signature'
                      : 'unsigned card'}
                  {#if c.fingerprint}· badge <code>{shortFingerprint(c.fingerprint)}</code>{/if}
                </span>
              {/if}
            </div>
            {#if c.fingerprint}
              <!-- eslint-disable-next-line svelte/no-at-html-tags (SVG generated locally from a hex fingerprint) -->
              <span class="identicon small-badge">{@html identiconSvg(c.fingerprint, 40)}</span>
            {/if}
            <div class="row-actions">
              {#if c.matrixId}
                <a
                  class="button secondary"
                  href={resolve(`/chat?dm=${encodeURIComponent(c.matrixId)}`)}>Message</a
                >
              {/if}
              {#each contactDeepLinks(c).filter( (l) => ['phone', 'email', 'telegram', 'whatsapp', 'signal'].includes(l.kind) ) as link (link.kind)}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                <a class="button secondary" href={link.href} rel="noreferrer">{link.label}</a>
              {/each}
              {#if c.matrixId}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                <a class="button secondary" href={matrixToUrl(c.matrixId)} rel="noreferrer"
                  >Element</a
                >
              {/if}
              <button
                class="button secondary"
                onclick={() =>
                  downloadTextFile(
                    `${c.fullName.replace(/[^\w-]+/g, '_')}.vcf`,
                    c.vcard,
                    'text/vcard;charset=utf-8',
                  )}
              >
                .vcf
              </button>
              <button class="button secondary danger" onclick={() => deleteContact(c.id)}
                >Delete</button
              >
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <p class="privacy">
    A QR code can be photographed and shared by anyone who sees it. Keep email and phone disabled
    unless you intentionally want to disclose them. Scanning is not identity verification.
  </p>
  <p><a href={resolve('/settings')}>Privacy and app settings →</a></p>
  <p><a href={resolve('/scan')}>Scan someone else's code →</a></p>
  <p><a href={resolve('/chat')}>Open chat →</a></p>
</EventGate>

<style>
  .profile-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.86rem;
    font-weight: 600;
  }
  .two-col {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 0.7rem;
  }
  fieldset {
    border: 1px solid color-mix(in srgb, var(--text-muted) 24%, transparent);
    border-radius: var(--radius);
    padding: 0.8rem;
  }
  legend {
    padding: 0 0.35rem;
    font-weight: 700;
  }
  .check {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.45rem;
    margin: 0.45rem 0;
    font-weight: 500;
  }
  .check input,
  .social-row input[type='checkbox'] {
    min-height: auto;
    accent-color: var(--event-primary-dark);
  }
  .socials {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .social-row {
    display: grid;
    grid-template-columns: 6rem 1fr auto;
    align-items: center;
    gap: 0.45rem;
    font-weight: 500;
  }
  .social-row input {
    min-width: 0;
  }
  .result {
    text-align: center;
  }
  .result img {
    display: block;
    width: min(320px, 100%);
    margin: 1rem auto;
    border: 0.6rem solid #fff;
  }
  .result-actions {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  details {
    margin-top: 1rem;
    text-align: left;
  }
  pre {
    overflow: auto;
    white-space: pre-wrap;
    font-size: 0.72rem;
    background: var(--surface);
    padding: 0.7rem;
  }
  .warning {
    color: var(--warning);
    font-size: 0.82rem;
    margin: -0.4rem 0 0;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .linkbtn {
    border: none;
    background: none;
    color: var(--event-primary-dark);
    padding: 0;
    cursor: pointer;
    text-align: left;
    font-size: 0.82rem;
  }
  .mono {
    font-family: ui-monospace, monospace;
  }
  .result-actions.left {
    justify-content: flex-start;
  }
  .contacts {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  .contacts li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 20%, transparent);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .who {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .row-actions .button {
    min-height: 36px;
    padding: 0.3rem 0.8rem;
  }
  .danger {
    color: var(--danger);
  }
  .badge-row {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-top: 0.4rem;
  }
  .identicon :global(svg) {
    display: block;
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .small-badge :global(svg) {
    width: 40px;
    height: 40px;
  }
  .sig-ok {
    color: var(--mint-ink);
  }
  .sig-bad {
    color: var(--danger);
  }
  .privacy {
    border-left: 3px solid var(--event-accent);
    padding-left: 0.7rem;
    color: var(--text-muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  @media (max-width: 480px) {
    .profile-link {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
