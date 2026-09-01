<script lang="ts">
  import type { ActivityType } from '@indiafoss/model';

  let { type }: { type: ActivityType | string } = $props();

  const label = $derived(type.replace(/-/g, ' '));
</script>

<span class="badge">{label}</span>

<style>
  .badge {
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--event-primary);
    background: color-mix(in srgb, var(--event-primary) 12%, transparent);
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
  }
</style>
