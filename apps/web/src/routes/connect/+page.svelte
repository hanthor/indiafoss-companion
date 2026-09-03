<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { resolve } from '$app/paths';
  import {
    avatarUrlFor,
    contactBookToJson,
    contactBookToVCards,
    contactDeepLinks,
    gravatarUrl,
    groupByDayMet,
    identiconSvg,
    isMatrixUserId,
    isNeutrinoServerName,
    isTicketRef,
    neutrinoMatrixId,
    searchContacts,
    shortFingerprint,
    signedAttendeeVCard,
    type AttendeeSocial,
  } from '@indiafoss/model';
  import { downloadTextFile } from '$lib/calendar';
  import { eventState } from '$lib/event.svelte';
  import {
    contactsState,
    deleteContact,
    hydrateContacts,
    importContactBook,
  } from '$lib/contacts.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import { hydrateIdentity, identityState } from '$lib/identity.svelte';
  import { features, hydrateFeatures } from '$lib/features.svelte';
  import { meshStatus } from '$lib/neutrino';
  import { applyImportedProfile, type ImportedChange } from '$lib/fossunited';
  import { importLinkedProfiles } from '$lib/profile-import';
  import { hasContactPicker, pickContact, profileFromContactFile } from '$lib/contact-import';
  import { profileUrlForUsername, usernameFromProfileUrl } from '@indiafoss/sources';
  import {
    hydrateProfile,
    profileState,
    saveProfile,
    saveSelection,
    setSocial,
    setSocialSelection,
    SOCIALS,
  } from '$lib/profile.svelte';
  import {
    byteLength,
    CARD_FIELDS,
    CARD_GROUPS,
    DEFAULT_LINK_NETWORKS,
    LINK_LABELS,
    LINK_PLACEHOLDERS,
    selectionKeyFor,
    sharedFieldCount,
    type CardFieldSpec,
    type CardGroup,
  } from '$lib/card-fields';
  import EventGate from '$lib/components/EventGate.svelte';

  /** QR payloads above this are unreliable to scan on a phone screen. */
  const MAX_QR_BYTES = 1500;

  // ---------- Card (always live) ----------
  let vcard = $state('');
  let qrDataUrl = $state<string | null>(null);
  let cardMessage = $state('');
  let qrTimer: ReturnType<typeof setTimeout> | null = null;

  /** This device's own mesh node id, when the P2P add-on is on and the node runs. */
  let meshServerName = $state<string | null>(null);

  $effect(() => {
    void hydrateProfile();
    void hydrateContacts();
    void hydrateIdentity();
    void hydrateFeatures().then(async () => {
      if (!features.chat) return;
      const status = await meshStatus();
      meshServerName = status.serverName?.toLowerCase() ?? null;
      // First time the node reports an identity, adopt it as this attendee's mesh id
      // and share it: it is what lets a scanned contact message you on the mesh.
      if (meshServerName && !profileState.profile.neutrinoServerName) {
        profileState.profile.neutrinoServerName = meshServerName;
        profileState.selection.neutrinoServerName = true;
        await persist();
      }
    });
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
  const invalidKeys = $derived(
    new Set<string>([
      ...(matrixIdValid ? [] : ['matrixId']),
      ...(neutrinoValid ? [] : ['neutrinoServerName']),
      ...(ticketValid ? [] : ['ticketRef']),
    ]),
  );

  const fieldCount = $derived(sharedFieldCount(profileState.profile, profileState.selection));
  const signed = $derived(!!identityState.pair);

  // ---------- Picture (#95) ----------
  // Gravatar needs a hash of the email; computed once per email, off the render path.
  let gravatar = $state<string | null>(null);
  $effect(() => {
    const email = profileState.profile.email;
    void gravatarUrl(email).then((url) => (gravatar = url));
  });
  /** What the card would carry: only pictures that reveal nothing the card does not already share. */
  const cardAvatar = $derived(
    avatarUrlFor(profileState.profile, {
      shareGithub: Boolean(profileState.selection.socials.github),
      gravatarUrl: profileState.selection.email ? gravatar : null,
    }),
  );
  /** What the attendee sees on their own card, whatever is shared. */
  const ownAvatar = $derived(avatarUrlFor(profileState.profile, { gravatarUrl: gravatar }));
  const avatarSource = $derived(
    profileState.profile.avatarUrl
      ? 'from your profile'
      : ownAvatar?.includes('github.com')
        ? 'from GitHub'
        : ownAvatar
          ? 'from Gravatar'
          : null,
  );
  const photoOn = $derived(profileState.selection.photo !== false);
  function togglePhoto(): void {
    profileState.selection.photo = !photoOn;
    scheduleCard();
  }
  /** Broken picture links, so a dead URL falls back to the badge instead of a broken image. */
  const avatarFailed = new SvelteSet<string>();

  /** Re-encode the card a beat after the last edit; saves the profile at the same time. */
  function scheduleCard(): void {
    if (qrTimer) clearTimeout(qrTimer);
    qrTimer = setTimeout(() => void buildCard(), 180);
  }

  async function persist(): Promise<void> {
    await saveProfile();
    await saveSelection();
  }

  async function buildCard(): Promise<void> {
    if (!profileState.loaded) return;
    if (invalidKeys.size > 0) {
      cardMessage = 'Fix the highlighted field to update the card.';
      return;
    }
    profileState.profile.neutrinoServerName =
      profileState.profile.neutrinoServerName?.trim().toLowerCase() || undefined;
    await persist();
    const value = await signedAttendeeVCard(
      profileState.profile,
      profileState.selection,
      identityState.pair,
      { gravatarUrl: profileState.selection.email ? gravatar : null },
    );
    vcard = value;
    if (byteLength(value) > MAX_QR_BYTES) {
      cardMessage = 'Too much for one QR. Switch off a field or two.';
      qrDataUrl = null;
      return;
    }
    cardMessage = '';
    const QRCode = await import('qrcode');
    qrDataUrl = await QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 432,
      color: { dark: '#141414', light: '#ffffff' },
    });
  }

  // First render once the profile and key are in; afterwards every edit reschedules.
  $effect(() => {
    void gravatar;
    if (profileState.loaded && identityState.ready) scheduleCard();
  });

  onMount(() => () => {
    if (qrTimer) clearTimeout(qrTimer);
  });

  // ---------- Rows ----------
  function valueOf(spec: CardFieldSpec): string {
    return (profileState.profile[spec.key as keyof typeof profileState.profile] as string) ?? '';
  }
  function setValue(spec: CardFieldSpec, value: string): void {
    let stored: string | undefined = value.trim() ? value : undefined;
    // The FOSS United row takes a username; the card carries the profile URL.
    if (spec.key === 'fossUnitedProfileUrl' && stored) {
      const username = usernameFromProfileUrl(stored);
      stored = username ? profileUrlForUsername(username) : stored;
    }
    (profileState.profile as unknown as Record<string, string | undefined>)[spec.key] = stored;
    scheduleCard();
  }
  /** What the input shows: the username for the FOSS United row, the value otherwise. */
  function shownValue(spec: CardFieldSpec): string {
    const value = valueOf(spec);
    if (spec.key === 'fossUnitedProfileUrl' && value) return usernameFromProfileUrl(value) ?? value;
    return value;
  }
  function isOn(spec: CardFieldSpec): boolean {
    const key = selectionKeyFor(spec.key as never);
    return key ? Boolean(profileState.selection[key]) : false;
  }
  function toggle(spec: CardFieldSpec): void {
    const key = selectionKeyFor(spec.key as never);
    if (!key) return;
    (profileState.selection as unknown as Record<string, boolean>)[key] = !isOn(spec);
    scheduleCard();
  }
  const rowsFor = (group: CardGroup) => CARD_FIELDS.filter((f) => f.group === group);

  // Links: default networks, anything with a value, and anything added this session.
  let extraNetworks = $state<AttendeeSocial[]>([]);
  let showAddMenu = $state(false);
  const shownNetworks = $derived.by(() => {
    // Scratch set for one computation, not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const set = new Set<AttendeeSocial>(DEFAULT_LINK_NETWORKS);
    for (const [k, v] of Object.entries(profileState.profile.socials)) {
      if (v) set.add(k as AttendeeSocial);
    }
    for (const n of extraNetworks) set.add(n);
    return SOCIALS.filter((n) => set.has(n));
  });
  const addableNetworks = $derived(SOCIALS.filter((n) => !shownNetworks.includes(n)));
  function addNetwork(n: AttendeeSocial): void {
    extraNetworks = [...extraNetworks, n];
    showAddMenu = false;
  }
  function setLink(n: AttendeeSocial, value: string): void {
    setSocial(n, value);
    // A freshly filled public link is shared unless the attendee switches it off.
    if (value.trim() && profileState.selection.socials[n] === undefined) {
      setSocialSelection(n, true);
    }
    scheduleCard();
  }
  function toggleLink(n: AttendeeSocial): void {
    setSocialSelection(n, !profileState.selection.socials[n]);
    scheduleCard();
  }

  // ---------- Imports: linked profiles (#96) and the phone's contacts (#94) ----------
  let importing = $state(false);
  let importMessage = $state('');
  let importChanges = $state<ImportedChange[]>([]);
  /** The profile as it was before the last import, so it can be taken back in one tap. */
  let importSnapshot = $state<string | null>(null);
  let contactFileInput = $state<HTMLInputElement | null>(null);
  let importingContact = $state(false);
  let contactMessage = $state('');

  function acceptChanges(changes: ImportedChange[], source: string): void {
    for (const change of changes) {
      const key = change.field as AttendeeSocial;
      // A freshly imported public link is shared unless switched off.
      if (SOCIALS.includes(key)) profileState.selection.socials[key] = true;
    }
    importChanges = changes;
    importMessage =
      changes.length === 0
        ? `Nothing new from ${source}: your card already has these fields.`
        : `Filled ${changes.length} field${changes.length === 1 ? '' : 's'} from ${source}.`;
    scheduleCard();
  }

  async function importProfiles(): Promise<void> {
    importing = true;
    importMessage = '';
    importChanges = [];
    const before = JSON.stringify(profileState.profile);
    try {
      const outcome = await importLinkedProfiles(profileState.profile);
      if (outcome.sources.length > 0) {
        importSnapshot = before;
        acceptChanges(outcome.changes, outcome.sources.join(' and '));
      }
      if (outcome.problems.length > 0) {
        importMessage = [importMessage, ...outcome.problems].filter(Boolean).join(' ');
      }
    } finally {
      importing = false;
    }
  }

  function undoImport(): void {
    if (!importSnapshot) return;
    const restored = JSON.parse(importSnapshot) as typeof profileState.profile;
    profileState.profile = { ...restored, socials: { ...restored.socials } };
    importSnapshot = null;
    importChanges = [];
    importMessage = 'Import taken back.';
    scheduleCard();
  }

  async function importFromContacts(): Promise<void> {
    contactMessage = '';
    if (hasContactPicker()) {
      importingContact = true;
      try {
        const picked = await pickContact();
        if (!picked) {
          contactMessage = 'Nothing picked.';
          return;
        }
        const before = JSON.stringify(profileState.profile);
        const changes = applyImportedProfile(profileState.profile, picked);
        if (changes.length > 0) importSnapshot = before;
        acceptChanges(changes, 'your contacts');
        contactMessage = importMessage;
      } finally {
        importingContact = false;
      }
      return;
    }
    contactFileInput?.click();
  }

  async function importContactFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importingContact = true;
    try {
      const imported = profileFromContactFile(await file.text());
      if (!imported) {
        contactMessage = 'That file is not a contact card (.vcf).';
        return;
      }
      const before = JSON.stringify(profileState.profile);
      const changes = applyImportedProfile(profileState.profile, imported);
      if (changes.length > 0) importSnapshot = before;
      acceptChanges(changes, 'your contact card');
      contactMessage = importMessage;
    } finally {
      importingContact = false;
      input.value = '';
    }
  }

  // ---------- Share / save ----------
  function downloadCard(): void {
    if (!vcard) return;
    downloadTextFile('indiafoss-contact.vcf', vcard, 'text/vcard;charset=utf-8');
  }

  async function shareCard(): Promise<void> {
    if (!vcard) return;
    if (typeof navigator.share !== 'function') {
      downloadCard();
      return;
    }
    const file = new File([vcard], 'indiafoss-contact.vcf', { type: 'text/vcard' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: profileState.profile.fullName || 'Contact' });
      } else {
        await navigator.share({ text: vcard, title: profileState.profile.fullName || 'Contact' });
      }
    } catch {
      /* cancelled */
    }
  }

  // ---------- People I met ----------
  let contactSearch = $state('');
  let importStatus = $state('');
  let importingBook = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  const shownContacts = $derived(searchContacts(contactsState.contacts, contactSearch));
  const metGroups = $derived(
    groupByDayMet(shownContacts, eventState.bundle?.timezone ?? 'Asia/Kolkata'),
  );

  const dayLabel = (day: string): string => {
    const ms = Date.parse(`${day}T12:00:00Z`);
    if (Number.isNaN(ms)) return day;
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };
  const timeLabel = (iso: string | undefined): string => {
    const ms = Date.parse(iso ?? '');
    if (Number.isNaN(ms)) return '';
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: eventState.bundle?.timezone ?? 'Asia/Kolkata',
    });
  };
  const metWhere = (c: { metActivityId?: string; metLocationId?: string }): string | null => {
    const bundle = eventState.bundle;
    if (c.metActivityId) {
      return bundle?.activities.find((a) => a.id === c.metActivityId)?.title ?? 'a session';
    }
    if (c.metLocationId) return c.metLocationId.replace(/-/g, ' ');
    return null;
  };

  function exportJson(): void {
    downloadTextFile(
      'indiafoss-contacts.json',
      contactBookToJson(contactsState.contacts, new Date().toISOString(), eventState.bundle?.id),
      'application/json',
    );
  }
  function exportVCards(): void {
    downloadTextFile(
      'indiafoss-contacts.vcf',
      contactBookToVCards(contactsState.contacts),
      'text/vcard;charset=utf-8',
    );
  }
  async function importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importingBook = true;
    importStatus = '';
    try {
      const outcome = await importContactBook(await file.text());
      importStatus = outcome
        ? `Imported ${outcome.format === 'json' ? 'contact book' : 'vCards'}: ${outcome.added} added, ${outcome.updated} updated${outcome.keyChanged > 0 ? `, ${outcome.keyChanged} saved separately (key changed)` : ''}${outcome.skipped > 0 ? `, ${outcome.skipped} unreadable` : ''}.`
        : 'That file is not a contact book or a .vcf.';
    } catch (error) {
      importStatus = error instanceof Error ? error.message : String(error);
    } finally {
      importingBook = false;
      input.value = '';
    }
  }

  let openContact = $state<string | null>(null);
</script>

<EventGate>
  <section class="intro">
    <div class="eyebrow">LOCAL · OPT-IN · OFFLINE</div>
    <h1>Your card</h1>
    <p class="muted">
      Show this to someone. Only the fields switched on below are encoded — nothing leaves this
      phone.
    </p>
  </section>

  <!-- Hero: the QR is always live -->
  <section class="card hero" aria-label="Your contact QR code">
    <div class="qrwrap">
      {#if fieldCount === 0}
        <!-- A code that encodes nothing is worse than no code: it invites
             someone to scan an empty card. Ask for a name first. -->
        <div class="qrempty" role="status">
          Add your name below and this becomes a code someone can scan.
        </div>
      {:else if qrDataUrl}
        <img
          src={qrDataUrl}
          alt="Your selected contact details as a QR code"
          width="216"
          height="216"
        />
      {:else}
        <div class="qrempty" role="status">{cardMessage || 'Encoding your card…'}</div>
      {/if}
    </div>
    <div class="who">
      {#if ownAvatar && !avatarFailed.has(ownAvatar)}
        <!-- A public picture the card links to, never uploaded by the app. -->
        <img
          class="avatar"
          src={ownAvatar}
          alt=""
          width="48"
          height="48"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror={() => ownAvatar && avatarFailed.add(ownAvatar)}
        />
      {/if}
      <div class="names">
        <strong>{profileState.profile.fullName || 'Your name'}</strong>
        <span class="muted">{profileState.profile.organization || 'Add an organisation below'}</span
        >
      </div>
      {#if identityState.identicon && identityState.fingerprint}
        <div class="badge">
          <!-- Deterministic pixel badge derived from this device's signing key. -->
          <!-- eslint-disable svelte/no-at-html-tags -- SVG generated locally from a hex fingerprint -->
          <span class="identicon">{@html identityState.identicon}</span>
          <!-- eslint-enable svelte/no-at-html-tags -->
          <span class="badgetext">
            KEY BADGE<br /><b>{shortFingerprint(identityState.fingerprint)}</b><br />
            <a href={resolve('/connect/compare')}>Compare ↗</a>
          </span>
        </div>
      {/if}
    </div>
    {#if fieldCount > 0}
      <div class="meta">
        <span>{fieldCount} {fieldCount === 1 ? 'FIELD' : 'FIELDS'} SHARED</span>
        <span class="ok">vCARD 3.0{signed ? ' · SIGNED' : ''}</span>
      </div>
    {/if}
    {#if cardMessage && qrDataUrl}<p class="warning small">{cardMessage}</p>{/if}
    <div class="heroactions">
      <button class="button primary" onclick={shareCard} disabled={!vcard}>Share card</button>
      <button class="button secondary" onclick={downloadCard} disabled={!vcard}>Save .vcf</button>
    </div>
  </section>

  <p class="muted small explain">
    Any phone camera saves you straight to Contacts. Scanned with the Companion, the same code also
    verifies your key badge and lets them message you. A QR can be photographed — email and phone
    stay off unless you switch them on.
  </p>

  <!-- Field groups -->
  {#each ['identity', 'links', 'private', 'extras'] as const as group (group)}
    {@const info = CARD_GROUPS[group]}
    <section class="group" class:amber={info.tone === 'amber'} aria-labelledby={`g-${group}`}>
      <div class="grouphead">
        <span class="eyebrow" id={`g-${group}`}>{info.title.toUpperCase()}</span>
        {#if group === 'identity'}
          <button class="linkbtn" onclick={importFromContacts} disabled={importingContact}>
            {importingContact ? 'Reading…' : 'From my contacts'}
          </button>
          <input
            bind:this={contactFileInput}
            type="file"
            accept=".vcf,text/vcard,text/x-vcard"
            onchange={importContactFile}
            hidden
          />
        {:else if group === 'links'}
          <button class="linkbtn" onclick={importProfiles} disabled={importing}>
            {importing ? 'Filling…' : 'Fill from my profiles ↗'}
          </button>
        {:else}
          <span class="muted small">{info.note}</span>
        {/if}
      </div>
      {#if group === 'identity'}
        {#if contactMessage}<p class="muted small" role="status">{contactMessage}</p>{/if}
        <p class="muted small hintline">
          {hasContactPicker()
            ? 'Picks your own entry from the phone\u2019s contacts; nothing is uploaded.'
            : 'Share your own entry from the Contacts app as a .vcf and pick it here; nothing is uploaded.'}
        </p>
        <!-- The picture row: not a text field, so it sits above the rows. -->
        <div class="row photo">
          <div class="field">
            <span class="label">Photo</span>
            {#if ownAvatar && !avatarFailed.has(ownAvatar)}
              <span class="photovalue">
                <img src={ownAvatar} alt="" width="28" height="28" referrerpolicy="no-referrer" />
                <span class="hint"
                  >{avatarSource}{photoOn && !cardAvatar
                    ? ' · only with the field it comes from'
                    : ''}</span
                >
              </span>
            {:else}
              <span class="hint"
                >Add a GitHub link, or fill from your profiles, and it appears.</span
              >
            {/if}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={photoOn && !!cardAvatar}
            aria-label="Share photo"
            class="switch tap-target"
            class:on={photoOn && !!cardAvatar}
            disabled={!ownAvatar}
            onclick={togglePhoto}><span class="knob"></span></button
          >
        </div>
      {/if}
      {#if group === 'links' && importMessage}
        <p class="muted small" role="status">{importMessage}</p>
        {#if importChanges.length > 0}
          <ul class="imported">
            {#each importChanges as change (change.field)}
              <li><strong>{change.field}</strong>: {change.value}</li>
            {/each}
          </ul>
        {/if}
        {#if importSnapshot}
          <button class="linkbtn small" onclick={undoImport}>Take the import back</button>
        {/if}
      {/if}
      <div class="rows">
        {#if group === 'links'}
          <!-- The FOSS United profile is one profile among the others (#96). -->
          {#each rowsFor('links') as spec (spec.key)}
            {@const on = isOn(spec)}
            <div class="row">
              <div class="field">
                <span class="label">{spec.label}</span>
                <input
                  aria-label={spec.label}
                  type={spec.inputType}
                  autocomplete="off"
                  spellcheck="false"
                  placeholder={spec.placeholder}
                  value={shownValue(spec)}
                  oninput={(e) => setValue(spec, e.currentTarget.value)}
                />
                {#if spec.hint}<span class="hint">{spec.hint}</span>{/if}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on && !!valueOf(spec).trim()}
                aria-label={`Share ${spec.label}`}
                class="switch tap-target"
                class:on={on && !!valueOf(spec).trim()}
                disabled={!valueOf(spec).trim()}
                title={valueOf(spec).trim() ? undefined : 'Fill in the field first'}
                onclick={() => toggle(spec)}><span class="knob"></span></button
              >
            </div>
          {/each}
          {#each shownNetworks as n (n)}
            {@const on = Boolean(profileState.selection.socials[n])}
            <div class="row">
              <div class="field">
                <span class="label">{LINK_LABELS[n]}</span>
                <input
                  aria-label={LINK_LABELS[n]}
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder={LINK_PLACEHOLDERS[n]}
                  value={profileState.profile.socials[n] ?? ''}
                  oninput={(e) => setLink(n, e.currentTarget.value)}
                />
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Share ${LINK_LABELS[n]}`}
                class="switch tap-target"
                class:on
                onclick={() => toggleLink(n)}><span class="knob"></span></button
              >
            </div>
          {/each}
          {#if addableNetworks.length > 0}
            {#if showAddMenu}
              <div class="addmenu" role="group" aria-label="Add a network">
                {#each addableNetworks as n (n)}
                  <button class="button secondary small" onclick={() => addNetwork(n)}
                    >{LINK_LABELS[n]}</button
                  >
                {/each}
              </div>
            {:else}
              <button class="addlink" onclick={() => (showAddMenu = true)}>
                + Add {addableNetworks
                  .slice(0, 4)
                  .map((n) => LINK_LABELS[n])
                  .join(', ')}…
              </button>
            {/if}
          {/if}
        {:else}
          {#each rowsFor(group) as spec (spec.key)}
            {@const on = isOn(spec)}
            {@const bad = invalidKeys.has(spec.key)}
            <div class="row" class:bad>
              <div class="field">
                <span class="label">{spec.label}</span>
                <input
                  aria-label={spec.label}
                  aria-invalid={bad}
                  type={spec.inputType}
                  autocomplete="off"
                  spellcheck="false"
                  class:mono={spec.mono}
                  placeholder={spec.placeholder}
                  value={shownValue(spec)}
                  oninput={(e) => setValue(spec, e.currentTarget.value)}
                />
                {#if spec.key === 'neutrinoServerName' && meshServerName && meshServerName !== profileState.profile.neutrinoServerName}
                  <button
                    class="linkbtn small"
                    onclick={() => {
                      profileState.profile.neutrinoServerName = meshServerName ?? undefined;
                      profileState.selection.neutrinoServerName = true;
                      scheduleCard();
                    }}>Use this device's mesh id</button
                  >
                {:else if spec.key === 'neutrinoServerName' && neutrinoValid && profileState.profile.neutrinoServerName}
                  <span class="hint"
                    >{neutrinoMatrixId(profileState.profile.neutrinoServerName)}</span
                  >
                {:else if bad}
                  <span class="hint warning">
                    {spec.key === 'matrixId'
                      ? 'Must look like @user:server'
                      : spec.key === 'ticketRef'
                        ? 'Must look like ticket::…'
                        : 'Must be 64 hexadecimal characters'}
                  </span>
                {:else if spec.hint}
                  <span class="hint">{spec.hint}</span>
                {/if}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on && !!valueOf(spec).trim()}
                aria-label={`Share ${spec.label}`}
                class="switch tap-target"
                class:on={on && !!valueOf(spec).trim()}
                disabled={!valueOf(spec).trim()}
                title={valueOf(spec).trim() ? undefined : 'Fill in the field first'}
                onclick={() => toggle(spec)}><span class="knob"></span></button
              >
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/each}

  <!-- People I met -->
  <section class="group people" aria-labelledby="g-people">
    <div class="grouphead">
      <span class="eyebrow" id="g-people">PEOPLE I MET · {contactsState.contacts.length}</span>
      <a href={resolve('/scan')}>Scan a code →</a>
    </div>
    {#if contactsState.contacts.length === 0}
      <div class="empty">
        <p class="muted">No one yet. Scan a friend's card and it lands here with where you met.</p>
        <a class="button" href={resolve('/scan')}>Scan a code</a>
      </div>
    {:else}
      <div class="book-actions">
        <input
          type="search"
          aria-label="Search contacts"
          placeholder="Search name, org, handle…"
          bind:value={contactSearch}
        />
        <button class="button secondary small" onclick={exportVCards}>Export .vcf</button>
        <button class="button secondary small" onclick={exportJson}>Backup</button>
        <button
          class="button secondary small"
          onclick={() => fileInput?.click()}
          disabled={importingBook}
        >
          {importingBook ? 'Importing…' : 'Import'}
        </button>
        <input
          bind:this={fileInput}
          type="file"
          accept=".json,.vcf,application/json,text/vcard"
          onchange={importFile}
          hidden
        />
      </div>
      {#if importStatus}<p class="muted small" role="status">{importStatus}</p>{/if}
      {#if shownContacts.length === 0}
        <p class="muted">No contact matches “{contactSearch}”.</p>
      {:else}
        <div class="rows">
          {#each metGroups as g (g.day)}
            <div class="dayhead">{g.day === 'unknown' ? 'Undated' : dayLabel(g.day)}</div>
            {#each g.contacts as c (c.id)}
              <div class="person" class:open={openContact === c.id}>
                <button
                  class="personrow"
                  onclick={() => (openContact = openContact === c.id ? null : c.id)}
                  aria-expanded={openContact === c.id}
                >
                  {#if avatarUrlFor(c) && !avatarFailed.has(avatarUrlFor(c) ?? '')}
                    <!-- Their public picture, from the PHOTO link on the card they showed. -->
                    <img
                      class="avatar small"
                      src={avatarUrlFor(c)}
                      alt=""
                      width="43"
                      height="43"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                      onerror={() => avatarFailed.add(avatarUrlFor(c) ?? '')}
                    />
                  {:else if c.fingerprint}
                    <!-- eslint-disable svelte/no-at-html-tags -- SVG generated locally from a hex fingerprint -->
                    <span class="identicon small-badge"
                      >{@html identiconSvg(c.fingerprint, 43)}</span
                    >
                    <!-- eslint-enable svelte/no-at-html-tags -->
                  {:else}
                    <span class="identicon small-badge blank" aria-hidden="true"></span>
                  {/if}
                  <span class="persontext">
                    <span class="line1">
                      <strong>{c.fullName}</strong>
                      {#if c.organization}<span class="muted">{c.organization}</span>{/if}
                    </span>
                    <span class="line2 muted">
                      {#if metWhere(c)}Met during <em>{metWhere(c)}</em>{:else}Met{/if}
                      {#if timeLabel(c.lastMetAt ?? c.savedAt)}· {timeLabel(
                          c.lastMetAt ?? c.savedAt,
                        )}{/if}
                      {#if (c.metCount ?? 1) > 1}· {c.metCount}×{/if}
                    </span>
                    <span
                      class="line3"
                      class:sig-ok={c.signature === 'valid'}
                      class:sig-bad={c.signature === 'invalid' || c.keyChanged}
                    >
                      {c.keyChanged
                        ? 'KEY CHANGED SINCE AN EARLIER CARD'
                        : c.signature === 'valid'
                          ? `SIGNED · BADGE ${shortFingerprint(c.fingerprint ?? '')}`
                          : c.signature === 'invalid'
                            ? 'BAD SIGNATURE'
                            : 'UNSIGNED CARD'}
                    </span>
                  </span>
                  <span class="chev" aria-hidden="true">›</span>
                </button>
                {#if openContact === c.id}
                  <div class="persondetail">
                    <SocialLinks links={contactDeepLinks(c)} compact />
                    <div class="detailactions">
                      {#if features.chat && c.neutrinoServerName}
                        <a
                          class="button secondary small"
                          href={resolve(
                            `/chat?dm=${encodeURIComponent(neutrinoMatrixId(c.neutrinoServerName))}`,
                          )}>Message on mesh</a
                        >
                      {/if}
                      <button
                        class="button secondary small"
                        onclick={() =>
                          downloadTextFile(
                            `${c.fullName.replace(/[^\w.-]+/g, '_') || 'contact'}.vcf`,
                            c.vcard,
                            'text/vcard;charset=utf-8',
                          )}>Save .vcf</button
                      >
                      <button class="button ghost small danger" onclick={() => deleteContact(c.id)}
                        >Remove</button
                      >
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          {/each}
        </div>
      {/if}
    {/if}
  </section>

  <p class="muted small explain">
    Everything here lives in this phone's storage. No account, no upload, no tracking.
    <a href={resolve('/settings')}>Privacy &amp; settings →</a>
  </p>
</EventGate>

<style>
  .intro {
    margin-bottom: 0.9rem;
  }
  .intro h1 {
    margin: 0.3rem 0 0.4rem;
  }
  .explain {
    margin: 0.6rem 0.15rem 1.2rem;
    line-height: 1.5;
  }

  /* Hero */
  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .qrwrap {
    display: flex;
    justify-content: center;
    margin-top: 0.2rem;
  }
  .qrwrap img,
  .qrempty {
    width: min(216px, 70vw);
    aspect-ratio: 1;
    height: auto;
    background: #fff;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    image-rendering: pixelated;
    box-sizing: content-box;
  }
  .qrempty {
    display: grid;
    place-items: center;
    text-align: center;
    /* The plate stays white in both themes because it stands in for the QR, so
       the text on it is dark in both themes too — --text-muted is light in
       dark mode and vanished here. */
    color: color-mix(in srgb, var(--ink) 80%, #fff);
    font-size: 0.85rem;
    padding: 1rem;
  }
  .who {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--border);
    flex: none;
    background: var(--surface);
  }
  .avatar.small {
    width: 43px;
    height: 43px;
  }
  .who .names {
    flex: 1;
  }
  .row.photo .photovalue {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .row.photo img {
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--border);
  }
  .hintline {
    margin: -0.2rem 0 0.5rem;
  }
  .names {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .names strong {
    font-size: 1.05rem;
    letter-spacing: -0.01em;
  }
  .names .muted {
    font-size: 0.85rem;
  }
  .badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: none;
  }
  .identicon {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 3px;
    background: #fff;
    line-height: 0;
  }
  .identicon :global(svg) {
    width: 30px;
    height: 30px;
  }
  .badgetext {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    line-height: 1.3;
    color: var(--text-muted);
  }
  .badgetext b {
    color: var(--text);
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    padding-top: 0.65rem;
  }
  .meta .ok {
    color: var(--mint-ink);
  }
  .heroactions {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 0.5rem;
  }

  /* Field groups */
  .group {
    margin: 0 0 1.1rem;
  }
  .grouphead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .group.amber .eyebrow,
  .group.amber .grouphead .muted {
    color: var(--amber-ink);
  }
  .rows {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.9rem;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .row.bad {
    background: color-mix(in srgb, var(--amber-soft) 40%, var(--surface));
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .label {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .field input {
    border: 0;
    background: transparent;
    padding: 0;
    min-height: 1.8rem;
    font-size: 0.95rem;
    width: 100%;
    min-width: 0;
    outline: none;
    color: var(--text);
    box-shadow: none;
  }
  .field input:focus-visible {
    outline: 2px solid var(--mint);
    outline-offset: 2px;
    border-radius: 3px;
  }
  .field input.mono {
    font-family: var(--font-mono);
    font-size: 0.85rem;
  }
  .hint {
    font-size: 0.72rem;
    color: var(--text-muted);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .hint.warning {
    color: var(--amber-ink);
  }
  .switch {
    width: 46px;
    height: 28px;
    border-radius: 999px;
    border: 0;
    padding: 2px;
    background: #cfcfcf;
    position: relative;
    transition: background 0.15s;
    flex: none;
    min-height: 0;
    cursor: pointer;
  }
  .switch .knob {
    display: block;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transform: translateX(0);
    transition: transform 0.15s;
  }
  .switch.on {
    background: var(--mint);
  }
  .switch.on .knob {
    transform: translateX(18px);
  }
  .group.amber .switch.on {
    background: var(--amber);
  }
  .switch:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .linkbtn {
    border: 0;
    background: transparent;
    color: var(--mint-ink);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.35rem 0;
    min-height: 0;
    cursor: pointer;
    text-align: left;
  }
  .linkbtn.small {
    font-size: 0.74rem;
  }
  .addlink {
    width: 100%;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--mint-ink);
    font-size: 0.85rem;
    font-weight: 600;
    text-align: left;
    padding: 0 0.9rem;
    cursor: pointer;
  }
  .addmenu {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.6rem 0.9rem 0.8rem;
  }
  .imported {
    list-style: none;
    padding: 0;
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    display: grid;
    gap: 0.1rem;
  }
  .imported li {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* People I met */
  .people .grouphead a {
    font-size: 0.8rem;
    font-weight: 600;
    text-decoration: none;
  }
  .empty {
    background: var(--surface);
    border: 1px dashed color-mix(in srgb, var(--text-muted) 45%, transparent);
    border-radius: 16px;
    padding: 1.3rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    text-align: center;
  }
  .book-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    margin: 0 0 0.6rem;
  }
  .book-actions input[type='search'] {
    flex: 1 1 10rem;
    min-width: 0;
  }
  .dayhead {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 0.55rem 0.9rem 0.2rem;
    background: color-mix(in srgb, var(--text-muted) 6%, var(--surface));
  }
  .person {
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .person:last-child {
    border-bottom: 0;
  }
  .personrow {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0.9rem;
    border: 0;
    background: transparent;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
    min-height: 0;
  }
  .person.open .personrow {
    background: color-mix(in srgb, var(--mint) 7%, transparent);
  }
  .small-badge :global(svg) {
    width: 35px;
    height: 35px;
  }
  .small-badge.blank {
    width: 35px;
    height: 35px;
    background: color-mix(in srgb, var(--text-muted) 12%, transparent);
  }
  .persontext {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .line1 {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    min-width: 0;
  }
  .line1 strong {
    font-size: 0.95rem;
  }
  .line1 .muted {
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line2 {
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line2 em {
    font-style: normal;
    color: var(--mint-ink);
  }
  .line3 {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .line3.sig-ok {
    color: var(--mint-ink);
  }
  .line3.sig-bad {
    color: var(--amber-ink);
  }
  .chev {
    color: var(--text-muted);
    font-size: 1.1rem;
  }
  .persondetail {
    padding: 0 0.9rem 0.8rem 3.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .detailactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .danger {
    color: var(--danger);
  }
</style>
