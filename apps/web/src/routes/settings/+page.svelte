<script lang="ts">
  import { resolve } from '$app/paths';
  import type { RoutingProfile } from '@indiafoss/venue';
  import { hydrateRoutingProfile, routingPrefs, setRoutingProfile } from '$lib/routingPrefs.svelte';

  $effect(() => {
    void hydrateRoutingProfile();
  });

  const profiles: { value: RoutingProfile; label: string; hint: string }[] = [
    { value: 'fastest', label: 'Fastest', hint: 'Uses stairs or lift, whichever is quicker.' },
    { value: 'accessible', label: 'Step-free (accessible)', hint: 'Lift only, no stairs.' },
    { value: 'avoid-stairs', label: 'Avoid stairs', hint: 'Prefers the lift over stairs.' },
  ];

  const privacyRules = [
    'No account is required for the conference app.',
    'Schedule, ranking, itinerary, notes, and contacts stay on this device.',
    'Email and phone are never included in contact sharing by default.',
    'Matrix messaging is optional and off until you sign in; your access token stays on this device.',
    'Scanned Matrix or Neutrino identities are shown as unverified until checked in a Matrix client.',
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
    <h2>Messaging</h2>
    <p class="muted">
      Optional Matrix chat for conference rooms and direct messages. Works with any homeserver;
      hands off to Element or a Neutrino client when you prefer.
    </p>
    <a class="button" href={resolve('/chat')}>Open chat →</a>
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
  .eyebrow {
    color: var(--event-primary-dark);
    font-family: 'Space Mono', ui-monospace, monospace;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.8rem;
  }
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
  .card {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin: 1rem 0;
  }
  .card h2 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
  }
  li {
    margin: 0.45rem 0;
  }
  .button {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    border-radius: 999px;
    padding: 0.5rem 1rem;
    background: var(--event-primary);
    color: var(--event-secondary);
    font-weight: 700;
    text-decoration: none;
  }
</style>
