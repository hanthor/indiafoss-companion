<script lang="ts">
  import { resolve } from '$app/paths';
  import { features, hydrateFeatures, setChatEnabled } from '$lib/features.svelte';
  import { getMatrix } from '$lib/matrix.svelte';
  import { stopMeshNode } from '$lib/neutrino';
  import { notificationsEnabled, setNotificationsEnabled } from '$lib/notifications.svelte';

  $effect(() => {
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
      Local "starting soon" and "leave now" alerts for your bookmarked sessions, timed with the walk
      from your last scanned location. Sessions marked <strong>★ Must attend</strong> also get a heads-up
      30 minutes before and an alert as they start. No push service, nothing leaves the device.
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
    <h2>Privacy</h2>
    <ul>
      {#each privacyRules as rule (rule)}<li>{rule}</li>{/each}
    </ul>
  </section>
</section>

<style>
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
