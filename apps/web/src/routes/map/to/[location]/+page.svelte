<script lang="ts">
  import { page } from '$app/state';
  import EventGate from '$lib/components/EventGate.svelte';
  import FloorPlan from '$lib/components/FloorPlan.svelte';

  const destination = $derived(page.params.location ?? '');
</script>

<EventGate>
  <FloorPlan initialTo={destination} />
</EventGate>
