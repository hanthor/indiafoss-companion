<script lang="ts">
  import { CompanionStorage } from '@indiafoss/storage';
  import { encodePersonalData } from '@indiafoss/model/contracts';
  import { downloadTextFile } from '$lib/calendar';

  let busy = $state(false);
  let status = $state('');
  let failed = $state(false);

  /**
   * On Android the file can go straight to the native app through the share
   * sheet. Web Share refuses .json, so the same JSON travels as a .txt file;
   * the app's import preview checks it like any other.
   */
  const canSendToApp =
    typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent) &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    typeof File !== 'undefined' &&
    navigator.canShare({ files: [new File(['{}'], 'probe.txt', { type: 'text/plain' })] });

  async function sendToApp(): Promise<void> {
    if (busy) return;
    busy = true;
    status = '';
    failed = false;
    try {
      const data = await new CompanionStorage().exportPersonalData();
      const file = new File(
        [encodePersonalData(data)],
        `indiafoss-personal-data-${data.exportedAt.slice(0, 10)}.txt`,
        { type: 'text/plain' },
      );
      await navigator.share({ files: [file], title: 'IndiaFOSS personal data' });
      status = 'Choose Companion in the share sheet, then review the import there.';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      failed = true;
      status = 'Could not hand your data to the app. Download the file instead.';
    } finally {
      busy = false;
    }
  }

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
  <p class="muted">
    Import the file below on another browser, or in the native Android app from its Settings page.
    On Android, Send to the Android app opens it there directly.
  </p>
  <div class="actions">
    {#if canSendToApp}
      <button class="button" onclick={sendToApp} disabled={busy}>Send to the Android app</button>
    {/if}
    <button class="button" class:secondary={canSendToApp} onclick={exportData} disabled={busy}>
      {busy ? 'Preparing export…' : 'Download personal data'}
    </button>
  </div>
  {#if status}
    <p role={failed ? 'alert' : 'status'}>{status}</p>
  {/if}
</section>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
