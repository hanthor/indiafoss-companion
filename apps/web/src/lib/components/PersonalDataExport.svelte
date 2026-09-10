<script lang="ts">
  import { CompanionStorage } from '@indiafoss/storage';
  import { encodePersonalData } from '@indiafoss/model/contracts';
  import { downloadTextFile } from '$lib/calendar';

  let busy = $state(false);
  let status = $state('');
  let failed = $state(false);

  async function exportData(): Promise<void> {
    if (busy) return;
    busy = true;
    status = '';
    failed = false;
    try {
      const file = await new CompanionStorage().exportPersonalData();
      downloadTextFile(
        `indiafoss-personal-data-${file.exportedAt.slice(0, 10)}.json`,
        encodePersonalData(file),
        'application/json',
      );
      status = 'Export prepared. Check your downloads for the file.';
    } catch {
      failed = true;
      status = 'Could not export your data. Nothing was changed. Please try again.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="card" aria-labelledby="personal-data-title">
  <h2 id="personal-data-title">Export personal data</h2>
  <p class="muted">
    Save your talk choices, devroom preferences, plan edits, notes and contact card in a file. The
    file contains private details, including fields you have chosen not to share on your card.
  </p>
  <p class="muted">Import on another device is not available yet. Keep the file for later.</p>
  <button class="button" onclick={exportData} disabled={busy}>
    {busy ? 'Preparing export…' : 'Download personal data'}
  </button>
  {#if status}
    <p role={failed ? 'alert' : 'status'}>{status}</p>
  {/if}
</section>
