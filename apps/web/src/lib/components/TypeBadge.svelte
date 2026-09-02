<script lang="ts">
  import type { ActivityType } from '@indiafoss/model';

  let { type }: { type: ActivityType | string } = $props();

  const label = $derived(type.replace(/-/g, ' '));
</script>

<span class="badge">{label}</span>

<style>
  .badge {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mint-ink);
    background: var(--mint-soft);
    border-radius: 3px;
    padding: 0.15rem 0.5rem;
  }
</style>
