<script lang="ts">
  import { readTicketFile } from '$lib/ticket-file';
  let {
    onselect,
    saveOnSelect = false,
  }: { onselect: (reference: string) => void; saveOnSelect?: boolean } = $props();
  let busy = $state(false);
  let message = $state('');
  let references = $state<string[]>([]);
  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || busy) return;
    busy = true;
    references = [];
    message = 'Reading ticket on this device…';
    try {
      references = await readTicketFile(file);
      message = 'Review the detected reference below. This does not verify admission.';
    } catch (error) {
      message =
        error instanceof Error
          ? error.message
          : 'Could not read this ticket. Try a screenshot or paste the ticket link.';
    } finally {
      busy = false;
      input.value = '';
    }
  }
</script>

<div class="upload">
  <label>
    <span>Upload ticket PDF or image</span>
    <input
      type="file"
      accept="application/pdf,image/png,image/jpeg,image/webp,.pdf"
      disabled={busy}
      onchange={upload}
    />
  </label>
  <p class="muted small">
    Read the QR code or barcode locally. PDF, PNG, JPEG or WebP; up to 20 MB and 10 PDF pages.
    Nothing is uploaded to a server.
  </p>
  <p role="status">{message}</p>
  {#each references as reference (reference)}
    <button
      type="button"
      class="button secondary"
      onclick={() => {
        onselect(reference);
        message = saveOnSelect
          ? 'Reference selected for saving to your contact card.'
          : 'Reference filled in. Review it and save when ready.';
      }}>{saveOnSelect ? 'Save' : 'Use'} {reference}</button
    >
  {/each}
</div>

<style>
  .upload {
    margin: 1rem 0;
  }
  label {
    display: grid;
    gap: 0.5rem;
  }
  input {
    max-width: 100%;
  }
</style>
