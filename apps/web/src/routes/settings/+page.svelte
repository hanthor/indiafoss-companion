<script lang="ts">
  import { resolve } from '$app/paths';

  const privacyRules = [
    'No account is required for the conference app.',
    'Schedule, ranking, itinerary, notes, and contacts stay on this device.',
    'Email and phone are never included in contact sharing by default.',
    'Matrix/Neutrino messaging is not enabled in the conference MVP.',
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
