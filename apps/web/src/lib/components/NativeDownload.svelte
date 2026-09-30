<script lang="ts">
  /**
   * The IndiaFOSS F-Droid repository (hanthor/indiafoss-android-repo). The
   * fingerprint is the index signing certificate's SHA-256, so an app store
   * that follows the link can check the repository before trusting it.
   */
  const REPO = 'hanthor.github.io/indiafoss-android-repo/fdroid/repo';
  const FINGERPRINT = 'AD932C530715E9CAA39415F94E007002FB3DA0DD2583FF92DFC7F6DFE46CCCC2';
  /** F-Droid, Neo Store and Droid-ify all answer fdroidrepos:// with an "Add repository" prompt. */
  const addRepo = `fdroidrepos://${REPO}?fingerprint=${FINGERPRINT}`;
  /** The same repository as a web address, for scanning from another phone. */
  const repoUrl = `https://${REPO}?fingerprint=${FINGERPRINT}`;

  let qr = $state('');
  async function drawQr(event: Event): Promise<void> {
    if (qr || !(event.currentTarget as HTMLDetailsElement).open) return;
    const QRCode = await import('qrcode');
    qr = await QRCode.toDataURL(repoUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: { dark: '#141414', light: '#ffffff' },
    });
  }
</script>

<section class="native-download" aria-label="Get the Android Companion">
  <div>
    <h2>Take the Companion to Android</h2>
    <p>Install the native app from the latest nightly build.</p>
  </div>
  <div class="download-actions">
    <a
      class="button dark"
      href="https://github.com/hanthor/indiafoss-companion/releases/download/nightly/indiafoss-companion-nightly.apk"
      >Download Android APK</a
    >
    <a href="https://github.com/hanthor/indiafoss-companion/releases/tag/nightly"
      >Release notes and checksums</a
    >
  </div>
  <div class="repo">
    <p class="small">
      <strong>Get updates automatically:</strong> add our F-Droid repository to F-Droid, Neo Store or
      Droid-ify, then install IndiaFOSS Companion from it.
    </p>
    <div class="download-actions">
      <a class="button" href={addRepo}>Add to F-Droid / Neo Store</a>
      <details ontoggle={drawQr}>
        <summary>QR code</summary>
        {#if qr}
          <img
            src={qr}
            width="160"
            height="160"
            alt="QR code for the IndiaFOSS F-Droid repository"
          />
        {/if}
      </details>
    </div>
    <p class="small muted fingerprint">
      Repository: {REPO}<br />Fingerprint: <code>{FINGERPRINT}</code>
    </p>
  </div>
  <p class="small muted">
    Or keep it updated with
    <a href="obtainium://add/https://github.com/hanthor/indiafoss-companion">Obtainium</a>
    (<a href="https://github.com/ImranR98/Obtainium/releases/latest">get Obtainium</a>). Same
    signing key either way.
  </p>
  <p class="small muted">Browser and Android data are currently separate.</p>
</section>

<style>
  .native-download {
    margin-block: 1rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  p {
    margin: 0.5rem 0;
  }
  .repo {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line-soft);
  }
  details summary {
    cursor: pointer;
    font-size: 0.9rem;
  }
  details img {
    display: block;
    margin-top: 0.5rem;
    border-radius: var(--radius);
  }
  .fingerprint code {
    overflow-wrap: anywhere;
    font-size: 0.72rem;
  }
  .download-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
</style>
