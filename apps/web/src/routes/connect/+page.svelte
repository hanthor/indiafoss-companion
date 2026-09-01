<script lang="ts">
  import { resolve } from '$app/paths';
  import { attendeeProfileToVCard, type AttendeeSocial } from '@indiafoss/model';
  import { downloadTextFile } from '$lib/calendar';
  import {
    hydrateProfile,
    profileState,
    saveProfile,
    saveSelection,
    setSocial,
    setSocialSelection,
    SOCIALS,
    usernameFromProfileUrl,
  } from '$lib/profile.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  let vcard = $state('');
  let qrDataUrl = $state<string | null>(null);
  let message = $state('');
  let generating = $state(false);

  $effect(() => {
    void hydrateProfile();
  });

  const profileUsername = $derived(
    profileState.profile.fossUnitedProfileUrl
      ? usernameFromProfileUrl(profileState.profile.fossUnitedProfileUrl)
      : null,
  );

  async function generateCard(): Promise<void> {
    generating = true;
    message = '';
    await saveProfile();
    await saveSelection();
    const value = attendeeProfileToVCard(profileState.profile, profileState.selection);
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
      <label
        >Matrix ID <input
          placeholder="@you:example.org"
          bind:value={profileState.profile.matrixId}
        /></label
      >
    </div>

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
        <span class="muted">(optional, no messaging here)</span></label
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
      <legend>Public social links</legend>
      <div class="socials">
        {#each SOCIALS as network (network)}
          <label class="social-row">
            <span>{network}</span>
            <input
              type="url"
              placeholder={`https://${network}.com/…`}
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

    <button class="button primary" type="submit" disabled={generating}>
      {generating ? 'Generating…' : 'Generate my QR card'}
    </button>
  </form>

  {#if qrDataUrl}
    <section class="card result" aria-live="polite">
      <h2>Show this QR to someone</h2>
      <p class="muted">Only the selected fields are encoded. They can scan it with any camera.</p>
      <img src={qrDataUrl} alt="Your selected contact details as a QR code" />
      <div class="result-actions">
        <button class="button secondary" onclick={shareCard}>Share vCard</button>
        <button class="button secondary" onclick={downloadCard}>Download .vcf</button>
      </div>
      <details>
        <summary>Preview vCard data</summary>
        <pre>{vcard}</pre>
      </details>
    </section>
  {/if}
  {#if message}<p class="muted" role="status">{message}</p>{/if}

  <p class="privacy">
    A QR code can be photographed and shared by anyone who sees it. Keep email and phone disabled
    unless you intentionally want to disclose them. Scanning is not identity verification.
  </p>
  <p><a href={resolve('/settings')}>Privacy and app settings →</a></p>
  <p><a href={resolve('/scan')}>Scan someone else's code →</a></p>
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
    font-size: 0.8rem;
  }
  .card {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin: 1rem 0;
  }
  .profile-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
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
  input {
    min-height: 42px;
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    background: var(--surface);
    font-weight: 400;
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
  }
  button.button {
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
  button:disabled {
    opacity: 0.6;
    cursor: wait;
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
