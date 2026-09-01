<script lang="ts">
  import { page } from '$app/state';
  import VenueMap from '$lib/components/VenueMap.svelte';

  const destination = $derived(page.params.location ?? '');
</script>

<VenueMap initialTo={destination} />
