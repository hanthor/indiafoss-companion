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
    <a
      href="fdroidrepos://hanthor.github.io/indiafoss-android-repo/fdroid/repo?fingerprint=AD932C530715E9CAA39415F94E007002FB3DA0DD2583FF92DFC7F6DFE46CCCC2"
      >Add IndiaFOSS Preview repository to F-Droid</a
    >
  </div>
  <p class="small muted">
    Keep it updated with the
    <a href="https://hanthor.github.io/indiafoss-android-repo/fdroid/repo"
      >IndiaFOSS Preview repository</a
    >
    or
    <a href="obtainium://add/https://github.com/hanthor/indiafoss-companion">Obtainium</a>
    (<a href="https://github.com/ImranR98/Obtainium/releases/latest">get Obtainium</a>). Both use
    the same signed Companion APK; Chat is not in this repository yet.
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
  .download-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
</style>
