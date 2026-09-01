<script lang="ts">
  let { title, phase }: { title: string; phase: string } = $props();
</script>

<section>
  <h1>{title}</h1>
  <p>Coming in {phase}.</p>
</section>
