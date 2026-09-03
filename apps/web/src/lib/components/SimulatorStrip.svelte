<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    appNow,
    formatSimTime,
    pauseSimulation,
    resumeSimulation,
    simState,
    stopSimulation,
    tickInterval,
  } from '$lib/simulator.svelte';

  /**
   * The strip under the app bar while the day simulator runs (#93): the
   * simulated time, the speed, pause/stop, and the last thing the app did
   * (a reminder that fired, the banner changing) so a walk-through of the day
   * can be watched, or read by Playwright through `window.__indiafossSim`.
   */
  let now = $state('');
  $effect(() => {
    if (!simState.run) return;
    now = appNow();
    const timer = setInterval(() => (now = appNow()), tickInterval(60_000));
    return () => clearInterval(timer);
  });

  const paused = $derived(simState.run?.speed === 0);
  const speed = $derived(simState.run ? simState.run.resumeSpeed : 0);
  const latest = $derived(
    [...simState.log].reverse().find((e) => e.kind === 'notification' || e.kind === 'banner') ??
      null,
  );
  const fired = $derived(simState.log.filter((e) => e.kind === 'notification').length);
</script>

{#if simState.run}
  <section class="strip" aria-label="Day simulator" data-testid="sim-strip">
    <div class="line">
      <span class="tag">SIMULATING</span>
      <span class="time" data-testid="sim-time">{now ? formatSimTime(now) : '…'}</span>
      <span class="speed">{paused ? 'PAUSED' : `${speed}×`}</span>
      <span class="grow"></span>
      <button class="ctl" onclick={() => (paused ? resumeSimulation() : pauseSimulation())}
        >{paused ? 'Resume' : 'Pause'}</button
      >
      <button class="ctl" onclick={stopSimulation}>Stop</button>
      <a class="ctl" href={resolve('/settings')} title="Simulator log and settings">Log ({fired})</a
      >
    </div>
    {#if latest}
      <div class="latest" role="status" data-testid="sim-latest">
        <span class="at">{latest.simAt.slice(11, 16)}</span>
        <span class="what">{latest.kind === 'notification' ? '🔔' : '▮'} {latest.title}</span>
        {#if latest.body}<span class="body">— {latest.body}</span>{/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  /* Not sticky: the leave-by banner below keeps its place under the app bar. */
  .strip {
    background: var(--amber-soft);
    color: var(--amber-ink);
    border-bottom: 1px solid var(--line);
    padding: 0.3rem 1rem;
    font-family: var(--font-mono);
    font-size: 0.64rem;
    letter-spacing: 0.04em;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }
  .tag {
    font-weight: 700;
    letter-spacing: 0.1em;
  }
  .time {
    font-weight: 700;
    color: var(--text);
  }
  .grow {
    flex: 1;
  }
  .ctl {
    border: 1px solid var(--amber-ink);
    background: transparent;
    color: var(--amber-ink);
    border-radius: 6px;
    padding: 0.1rem 0.4rem;
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    min-height: 0;
    cursor: pointer;
  }
  .latest {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.15rem;
    color: var(--text);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .latest .at {
    font-weight: 700;
  }
  .latest .body {
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
