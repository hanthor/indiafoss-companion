<script lang="ts">
  import { resolve } from '$app/paths';
  import type { RoutingProfile } from '@indiafoss/venue';
  import { hydrateRoutingProfile, routingPrefs, setRoutingProfile } from '$lib/routingPrefs.svelte';
  import { features, hydrateFeatures, setChatEnabled } from '$lib/features.svelte';
  import { getMatrix } from '$lib/matrix.svelte';
  import { stopMeshNode } from '$lib/neutrino';
  import { notificationsEnabled, setNotificationsEnabled } from '$lib/notifications.svelte';

  $effect(() => {
    void hydrateRoutingProfile();
    void hydrateFeatures();
  });

  async function toggleChat(on: boolean) {
    await setChatEnabled(on);
    if (!on) {
      // Switching off tears everything down: session, sync loop and the mesh node.
      await getMatrix()
        .signOut()
        .catch(() => {});
      await stopMeshNode();
    }
  }

  const profiles: { value: RoutingProfile; label: string; hint: string }[] = [
    { value: 'fastest', label: 'Fastest', hint: 'Uses stairs or lift, whichever is quicker.' },
    { value: 'accessible', label: 'Step-free (accessible)', hint: 'Lift only, no stairs.' },
    { value: 'avoid-stairs', label: 'Avoid stairs', hint: 'Prefers the lift over stairs.' },
  ];

  const privacyRules = [
    'No account is required for the conference app.',
    'Schedule, ranking, itinerary, notes, and contacts stay on this device.',
    'Email and phone are never included in contact sharing by default.',
    'Peer-to-peer chat is optional and off until you switch it on; it never signs in to a public Matrix account.',
    'Scanned Matrix or mesh identities are shown as unverified until checked in person or in a Matrix client.',
  ];
</script>

<section>
  <div class="eyebrow">CONTROL YOUR DATA</div>
  <h1>Settings</h1>
  <section class="card">
    <h2>Contact sharing</h2>
    <p class="muted">
      Use your FOSS United profile as your public identity and choose fields locally.
    </p>
    <a class="button" href={resolve('/connect')}>Open contact card →</a>
  </section>
  <section class="card">
    <h2>Peer-to-peer chat</h2>
    <p class="muted">
      Optional. Session chats and direct messages with nearby attendees over Bluetooth and Wi-Fi
      mesh from the Android app, without venue internet. Nothing runs until you switch it on.
    </p>
    <label class="switch">
      <input
        type="checkbox"
        role="switch"
        checked={features.chat}
        disabled={!features.loaded}
        onchange={(e) => void toggleChat(e.currentTarget.checked)}
      />
      <span>Enable P2P chat</span>
    </label>
    {#if features.chat}
      <a class="button" href={resolve('/chat')}>Open chat →</a>
    {/if}
    <p class="muted small">
      Public Matrix accounts are not used inside the app. Contact cards carry Matrix ids so you can
      continue a conversation in Element when you want to.
    </p>
  </section>
  <section class="card">
    <h2>Reminders</h2>
    <p class="muted">
      Local "starting soon" and "leave now" alerts for the sessions on your plan, timed with the
      walk from your last scanned location. No push service, nothing leaves the device.
    </p>
    <label class="switch">
      <input
        type="checkbox"
        role="switch"
        checked={notificationsEnabled.value}
        onchange={(e) => void setNotificationsEnabled(e.currentTarget.checked)}
      />
      <span>Enable reminders</span>
    </label>
  </section>
  <section class="card">
    <h2>Getting around</h2>
    <p class="muted">Routing profile for walk times, leave-by, and itinerary feasibility.</p>
    <div class="profiles">
      {#each profiles as p (p.value)}
        <label class="profile" class:active={routingPrefs.profile === p.value}>
          <input
            type="radio"
            name="routing-profile"
            value={p.value}
            checked={routingPrefs.profile === p.value}
            onchange={() => setRoutingProfile(p.value)}
          />
          <span class="profile-label">{p.label}</span>
          <span class="muted small">{p.hint}</span>
        </label>
      {/each}
    </div>
  </section>
  <section class="card">
    <h2>Privacy</h2>
    <ul>
      {#each privacyRules as rule (rule)}<li>{rule}</li>{/each}
    </ul>
  </section>
</section>

<style>
  .profiles {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }
  .profile {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas: 'radio label' 'radio hint';
    column-gap: 0.6rem;
    align-items: center;
    padding: 0.6rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 25%, transparent);
    border-radius: 10px;
    cursor: pointer;
  }
  .profile.active {
    border-color: var(--event-primary);
  }
  .profile input {
    grid-area: radio;
    accent-color: var(--event-primary-dark);
  }
  .profile-label {
    grid-area: label;
    font-weight: 600;
  }
  .profile .small {
    grid-area: hint;
  }
  li {
    margin: 0.45rem 0;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 600;
    margin: 0.4rem 0 0.8rem;
    cursor: pointer;
  }
  .switch input {
    width: 1.3rem;
    height: 1.3rem;
    accent-color: var(--event-primary-dark);
  }
</style>
