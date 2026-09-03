<script lang="ts">
  import { resolve } from '$app/paths';
  import { features, hydrateFeatures, setChatEnabled } from '$lib/features.svelte';
  import { getMatrix } from '$lib/matrix.svelte';
  import { stopMeshNode } from '$lib/neutrino';
  import { notificationsEnabled, setNotificationsEnabled } from '$lib/notifications.svelte';
  import { lookState, setLook } from '$lib/look.svelte';
  import { goto } from '$app/navigation';
  import { formatDayLabel, getEventDays } from '@indiafoss/schedule';
  import { eventState, loadEvent } from '$lib/event.svelte';
  import {
    dayStart,
    formatSimTime,
    hydrateSimulator,
    SIM_SPEEDS,
    simState,
    startSimulation,
    stopSimulation,
  } from '$lib/simulator.svelte';

  $effect(() => {
    void hydrateFeatures();
    hydrateSimulator();
    void loadEvent();
  });

  // ---------- Day simulator (#93) ----------
  const days = $derived(eventState.bundle ? getEventDays(eventState.bundle) : []);
  let simDay = $state('');
  let simTime = $state('08:30');
  let simSpeed = $state<number>(60);
  $effect(() => {
    if (!simDay && days.length > 0) simDay = days[0]!;
  });
  const simLog = $derived([...simState.log].reverse().slice(0, 40));

  async function beginSimulation(): Promise<void> {
    const bundle = eventState.bundle;
    if (!bundle || !simDay) return;
    const sample = bundle.activities.find((a) => a.start)?.start ?? `${simDay}T00:00:00+05:30`;
    startSimulation(dayStart(simDay, simTime, sample), simSpeed);
    await goto(resolve('/now'));
  }

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
  <section class="card" aria-labelledby="look-title">
    <h2 id="look-title">Look</h2>
    <p class="muted">
      The IndiaFOSS 2026 design, or Material 3 the way the phone's own apps look. On Android the
      Material look follows your wallpaper's colours{lookState.dynamic ? ' (as it does now)' : ''}.
    </p>
    <div class="looks" role="radiogroup" aria-label="Look">
      <button
        role="radio"
        aria-checked={lookState.look === 'indiafoss'}
        class="button"
        class:primary={lookState.look === 'indiafoss'}
        onclick={() => setLook('indiafoss')}>IndiaFOSS</button
      >
      <button
        role="radio"
        aria-checked={lookState.look === 'material'}
        class="button"
        class:primary={lookState.look === 'material'}
        onclick={() => setLook('material')}>Material</button
      >
    </div>
  </section>
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
  <section class="card" aria-labelledby="sim-title">
    <h2 id="sim-title">Simulate the day</h2>
    <p class="muted">
      Run the whole app through a conference day in minutes: the Now screen, the leave-by banner and
      every reminder behave exactly as they would, on a clock that runs faster than real time. Your
      bookmarks and ratings are the real ones; nothing is changed by a run.
    </p>
    {#if simState.run}
      <p class="simstatus" role="status">
        Running at {simState.run.speed === 0 ? 'pause' : `${simState.run.speed}×`} from
        {formatSimTime(simState.run.start)}.
      </p>
      <div class="simactions">
        <a class="button" href={resolve('/now')}>Watch on Now →</a>
        <button class="button secondary" onclick={stopSimulation}>Stop simulation</button>
      </div>
      {#if simLog.length > 0}
        <details class="simlog" open>
          <summary>What happened ({simState.log.length})</summary>
          <ol reversed>
            {#each simLog as e, i (`${e.realAt}-${i}`)}
              <li>
                <span class="at">{e.simAt.slice(11, 16)}</span>
                <span class="kind">{e.kind}</span>
                <span class="what">{e.title}{e.body ? ` — ${e.body}` : ''}</span>
              </li>
            {/each}
          </ol>
        </details>
      {/if}
    {:else}
      <div class="simform">
        <label>
          <span>Day</span>
          <select bind:value={simDay} disabled={days.length === 0}>
            {#each days as day, i (day)}
              <option value={day}>Day {i + 1} · {formatDayLabel(day)}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>Start at</span>
          <input type="time" bind:value={simTime} />
        </label>
        <label>
          <span>Speed</span>
          <select bind:value={simSpeed}>
            {#each SIM_SPEEDS as speed (speed)}
              <option value={speed}>{speed}× {speed === 60 ? '(a minute a second)' : ''}</option>
            {/each}
          </select>
        </label>
      </div>
      <button class="button" onclick={beginSimulation} disabled={!simDay}>Start simulation</button>
      {#if !notificationsEnabled.value}
        <p class="muted small">
          Reminders are off, so the run will show the banner and screens but no alerts. Switch them
          on above to see them fire too.
        </p>
      {/if}
      <p class="muted small">
        Also from a URL: <code>/now?now=2025-09-20T09:00:00+05:30&amp;speed=100</code>. Automation
        reads the run and its log from <code>window.__indiafossSim</code>.
      </p>
    {/if}
  </section>
  <section class="card">
    <h2>Setup</h2>
    <p class="muted">
      The welcome steps from the first run: reminders, ticket, your card, ranking. Nothing is reset
      by running them again.
    </p>
    <a class="button secondary" href={resolve('/welcome')}>Run setup again</a>
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
  .looks {
    display: flex;
    gap: 0.5rem;
    margin: 0.4rem 0 0.2rem;
  }
  .simform {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.6rem;
    margin: 0.6rem 0 0.8rem;
  }
  .simform label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .simform select,
  .simform input {
    font: inherit;
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--text);
  }
  .simstatus {
    font-weight: 600;
  }
  .simactions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.4rem 0 0.8rem;
  }
  .simlog summary {
    cursor: pointer;
    font-weight: 600;
  }
  .simlog ol {
    padding-left: 1.2rem;
    font-size: 0.8rem;
  }
  .simlog li {
    display: flex;
    gap: 0.5rem;
    margin: 0.3rem 0;
  }
  .simlog .at {
    font-family: var(--font-mono);
    font-weight: 700;
  }
  .simlog .kind {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding-top: 0.15rem;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.78rem;
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
