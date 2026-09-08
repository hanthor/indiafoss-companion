<script lang="ts">
  import ProfileImport from '$lib/components/ProfileImport.svelte';
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { parseScannedPayload, type AttendeeSocial } from '@indiafoss/model';
  import { eventState } from '$lib/event.svelte';
  import ReminderStatus from '$lib/components/ReminderStatus.svelte';
  import {
    notificationsEnabled,
    reminderState,
    setNotificationsEnabled,
  } from '$lib/notifications.svelte';
  import { hydrateProfile, profileState, saveProfile, setSocial } from '$lib/profile.svelte';
  import { LINK_LABELS, LINK_PLACEHOLDERS } from '$lib/card-fields';
  import { markOnboardingDone } from '$lib/onboarding.svelte';
  import TicketUpload from '$lib/components/TicketUpload.svelte';
  import { hasContactPicker, pickContact, profileFromContactFile } from '$lib/contact-import';
  import { applyImportedProfile, type ImportedProfile } from '$lib/fossunited';
  import EventGate from '$lib/components/EventGate.svelte';

  /**
   * The welcome wizard (#107): reminders, ticket, who you are, then ranking.
   * Every step can be skipped; nothing here cannot be changed later from
   * Settings, Your contact card or the Rank screen.
   */
  const STEPS = ['reminders', 'ticket', 'you', 'rank'] as const;
  type Step = (typeof STEPS)[number];
  let step = $state<Step>('reminders');
  const index = $derived(STEPS.indexOf(step));
  const bundle = $derived(eventState.bundle);

  $effect(() => {
    void hydrateProfile();
  });

  // Reminders
  async function turnOnReminders(): Promise<void> {
    await setNotificationsEnabled(true);
  }

  // Ticket
  let ticket = $state('');
  const parsedTicket = $derived(parseScannedPayload(ticket));
  const ticketOk = $derived(!ticket.trim() || parsedTicket.kind === 'ticket');
  async function saveTicket(): Promise<void> {
    if (!ticketOk) return;
    if (parsedTicket.kind === 'ticket') {
      profileState.profile.ticketRef = parsedTicket.ticketRef;
      await saveProfile();
    }
    next();
  }

  // Contact imports fill blanks and never change sharing switches.
  let contactMessage = $state('');
  function fillContact(imported: ImportedProfile | null) {
    if (!imported) {
      contactMessage = 'No contact selected or no readable contact found.';
      return;
    }
    const changes = applyImportedProfile(profileState.profile, imported);
    contactMessage = changes.length
      ? 'Contact details filled in. Review them before saving.'
      : 'Your existing details were kept; no empty fields to fill.';
  }
  async function importContactFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error('Choose a contact file smaller than 256 KB.');
      fillContact(profileFromContactFile(await file.text()));
    } catch (error) {
      contactMessage = error instanceof Error ? error.message : 'Could not read this contact file.';
    } finally {
      input.value = '';
    }
  }
  // You
  const SOCIALS_HERE: AttendeeSocial[] = ['github', 'linkedin', 'mastodon'];
  async function saveYou(): Promise<void> {
    profileState.profile.fullName = profileState.profile.fullName.trim();
    await saveProfile();
    next();
  }

  function next(): void {
    const at = STEPS.indexOf(step);
    if (at < STEPS.length - 1) step = STEPS[at + 1]!;
  }
  function back(): void {
    const at = STEPS.indexOf(step);
    if (at > 0) step = STEPS[at - 1]!;
  }
  async function finish(to: '/plan/rank' | '/'): Promise<void> {
    await markOnboardingDone();
    await goto(resolve(to));
  }
</script>

<svelte:head>
  <title>Welcome · IndiaFOSS Companion</title>
</svelte:head>

<EventGate>
  <section class="hero" aria-labelledby="welcome-title">
    <span class="tagline">Set up in a minute</span>
    <h1 id="welcome-title">Welcome to {bundle?.name ?? 'IndiaFOSS'}</h1>
    <p class="hero-desc">
      Four quick questions, all optional, so the app can remind you, know your ticket, put your name
      on a contact card and plan your day. Everything stays on this device.
    </p>
  </section>

  <ol class="dots" aria-label="Setup steps">
    {#each STEPS as s, i (s)}
      <li
        class:done={i < index}
        class:current={i === index}
        aria-current={i === index ? 'step' : undefined}
      >
        <span class="sr-only">{s}</span>
      </li>
    {/each}
  </ol>

  <section class="card step" aria-live="polite">
    {#if step === 'reminders'}
      <div class="eyebrow">1 · REMINDERS</div>
      <h2>Choose how to get reminders</h2>
      <p class="muted">
        A local "starting soon" and "leave now" alert for the sessions you bookmark, timed with the
        walk from wherever you last scanned. No push service, nothing leaves the phone.
      </p>
      <ReminderStatus />
      {#if notificationsEnabled.value}
        <div class="actions">
          <button class="button dark" onclick={next}>Next →</button>
        </div>
      {:else}
        <div class="actions">
          <button
            class="button dark"
            onclick={turnOnReminders}
            disabled={reminderState.status === 'requesting' ||
              reminderState.status === 'unsupported'}>Turn on reminders</button
          >
          <button class="button secondary" onclick={next}>Not now</button>
        </div>
      {/if}
    {:else if step === 'ticket'}
      <div class="eyebrow">2 · TICKET</div>
      <h2>Your ticket reference</h2>
      <p class="muted">
        Upload your ticket PDF or a screenshot to read its QR code, or paste the FOSS United ticket
        link. Review the reference before saving. Ticket sharing stays off unless you enable it.
      </p>
      <TicketUpload onselect={(reference) => (ticket = reference)} />
      <label class="field">
        <span>Ticket reference</span>
        <input
          type="text"
          class="mono"
          placeholder="ticket::…"
          bind:value={ticket}
          aria-invalid={!ticketOk}
          autocapitalize="off"
          autocomplete="off"
        />
        {#if !ticketOk}<span class="hint warn"
            >Paste a FOSS United ticket link or ticket::… reference</span
          >{/if}
      </label>
      <div class="actions">
        <button class="button dark" onclick={saveTicket} disabled={!ticketOk}
          >{ticket.trim() ? 'Save ticket →' : 'No ticket yet →'}</button
        >
        <a class="button secondary" href={resolve('/scan')}>Scan my ticket</a>
        <button class="linkbtn" onclick={back}>← Back</button>
      </div>
    {:else if step === 'you'}
      <div class="eyebrow">3 · YOU</div>
      <h2>Your contact card</h2>
      <p class="muted">
        Your name and a few public profiles make the contact card people scan when you meet. Add
        more, or take any of it off, under Your contact card later.
      </p>
      <ProfileImport onimport={fillContact} />
      <p class="muted">
        Use your browser or password manager’s identity autofill, or import your own contact. Email
        and phone stay off your shared card unless you enable them.
      </p>
      {#if hasContactPicker()}
        <button
          type="button"
          class="button secondary"
          onclick={async () => fillContact(await pickContact())}>From my contacts</button
        >
      {/if}
      <label class="field">
        <span>Import my contact (.vcf)</span>
        <input type="file" accept=".vcf,text/vcard,text/x-vcard" onchange={importContactFile} />
        <span class="hint"
          >Export your own entry from Contacts, then choose that file. Nothing is uploaded.</span
        >
      </label>
      <p role="status">{contactMessage}</p>
      <form
        autocomplete="on"
        onsubmit={(event) => {
          event.preventDefault();
          void saveYou();
        }}
      >
        <label class="field">
          <span>Name</span>
          <input
            type="text"
            name="name"
            autocomplete="name"
            placeholder="Your name"
            bind:value={profileState.profile.fullName}
          />
        </label>
        <label class="field">
          <span>Organisation</span>
          <input
            type="text"
            name="organization"
            autocomplete="organization"
            placeholder="Company, project or college"
            bind:value={profileState.profile.organization}
          />
        </label>
        <label class="field"
          ><span>Email</span><input
            type="email"
            name="email"
            autocomplete="email"
            bind:value={profileState.profile.email}
          /></label
        >
        <label class="field"
          ><span>Phone</span><input
            type="tel"
            name="tel"
            autocomplete="tel"
            bind:value={profileState.profile.phone}
          /></label
        >
        {#each SOCIALS_HERE as network (network)}
          <label class="field">
            <span>{LINK_LABELS[network]}</span>
            <input
              type="text"
              placeholder={LINK_PLACEHOLDERS[network]}
              value={profileState.profile.socials[network] ?? ''}
              oninput={(e) => setSocial(network, e.currentTarget.value)}
              autocapitalize="off"
            />
          </label>
        {/each}
        <label class="field">
          <span>FOSS United username</span>
          <input
            type="text"
            placeholder="your_username"
            bind:value={profileState.profile.fossUnitedProfileUrl}
            autocapitalize="off"
          />
        </label>
        <div class="actions">
          <button type="submit" class="button dark"
            >{profileState.profile.fullName.trim() ? 'Save →' : 'Skip for now →'}</button
          >
          <button type="button" class="linkbtn" onclick={back}>← Back</button>
        </div>
      </form>
    {:else}
      <div class="eyebrow">4 · YOUR DAY</div>
      <h2>Rank the sessions</h2>
      <p class="muted">
        Say which devrooms are for you, swipe through the talks, settle the overlaps: a few minutes
        now and the app builds a plan around what you would actually go to.
      </p>
      <div class="actions">
        <button class="button dark" onclick={() => finish('/plan/rank')}>Find talks for me →</button
        >
        <button class="button secondary" onclick={() => finish('/')}>Later, show me around</button>
        <button class="linkbtn" onclick={back}>← Back</button>
      </div>
    {/if}
  </section>

  <p class="muted small center">
    <button class="linkbtn" onclick={() => finish('/')}>Skip setup</button>
    · You can run this again from Settings.
  </p>
</EventGate>

<style>
  .hero {
    background: var(--ink);
    color: var(--on-ink);
    border-radius: 20px;
    padding: 1.4rem 1.2rem 1.3rem;
    margin-bottom: 1rem;
  }
  .tagline {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--mint);
  }
  .hero h1 {
    margin: 0.3rem 0 0.5rem;
    font-size: 1.5rem;
    line-height: 1.2;
  }
  .hero-desc {
    margin: 0;
    line-height: 1.5;
    color: color-mix(in srgb, var(--on-ink) 80%, transparent);
    text-wrap: pretty;
  }
  .dots {
    list-style: none;
    padding: 0;
    margin: 0 0 0.8rem;
    display: flex;
    gap: 0.4rem;
  }
  .dots li {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--text-muted) 22%, transparent);
  }
  .dots li.done {
    background: var(--mint-ink);
  }
  .dots li.current {
    background: var(--mint);
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .step h2 {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.25;
  }
  .step p {
    margin: 0;
    line-height: 1.5;
    text-wrap: pretty;
  }
  .ok {
    color: var(--mint-ink);
    font-weight: 600;
  }
  .warn {
    color: var(--amber-ink);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .field input {
    font: inherit;
    font-weight: 400;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-raised);
    color: var(--text);
  }
  .field input.mono {
    font-family: var(--font-mono);
  }
  .field input[aria-invalid='true'] {
    border-color: var(--amber-ink);
  }
  .hint {
    font-weight: 400;
    font-size: 0.78rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }
  .button.dark {
    background: var(--ink);
    color: var(--on-ink);
    border-color: var(--ink);
  }
  .center {
    text-align: center;
    margin-top: 1rem;
  }
  .linkbtn {
    border: 0;
    background: transparent;
    color: var(--mint-ink);
    font: inherit;
    font-weight: 600;
    padding: 0.4rem 0.2rem;
    cursor: pointer;
    min-height: 0;
    text-decoration: underline;
  }
</style>
