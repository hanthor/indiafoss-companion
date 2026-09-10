<script lang="ts">
  import { importGithubProfile } from '$lib/github';
  import type { ImportedProfile } from '$lib/fossunited';

  let { onimport }: { onimport: (profile: ImportedProfile) => void } = $props();
  let username = $state('');
  let busy = $state(false);
  let preview = $state<ImportedProfile | null>(null);
  let message = $state('');
  let request = 0;

  function reset() {
    request += 1;
    busy = false;
    preview = null;
    message = '';
  }

  async function findProfile() {
    const current = ++request;
    busy = true;
    preview = null;
    message = '';
    try {
      const result = await importGithubProfile(username);
      if (current !== request) return;
      if (result.ok && result.profile) {
        preview = result.profile;
      } else {
        const errors = {
          'invalid-url': 'Enter a GitHub username or profile URL.',
          'not-found': 'That GitHub profile was not found.',
          'rate-limited': 'GitHub is limiting requests from this network. Try again later.',
          network: 'Could not reach GitHub. Check your connection and try again.',
          blocked: 'Could not read this profile.',
        };
        message = errors[result.failure ?? 'network'];
      }
    } catch {
      if (current === request) message = 'Could not read this profile. Try again.';
    } finally {
      if (current === request) busy = false;
    }
  }

  function apply() {
    if (!preview) return;
    onimport(preview);
    preview = null;
    message =
      'Profile imported. Review your contact details below; existing details and sharing choices were kept.';
  }
</script>

<section class="profile-import" aria-label="Import your profile">
  <h3>Start with your GitHub profile</h3>
  <p>Fill your contact details from a public profile. No sign-in needed.</p>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void findProfile();
    }}
  >
    <label>
      Username or profile URL
      <input
        bind:value={username}
        oninput={reset}
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        placeholder="username or github.com/username"
      />
    </label>
    <button class="button dark" type="submit" disabled={busy || !username.trim()}
      >{busy ? 'Looking up…' : 'Find profile'}</button
    >
  </form>
  {#if preview}
    <div class="preview" aria-label="Profile preview">
      <h4>Review profile</h4>
      <dl>
        {#each Object.entries( { Name: preview.fullName, Organisation: preview.organization, Email: preview.email, Website: preview.website, ...preview.socials } ) as [label, value] (label)}
          {#if value}<div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>{/if}
        {/each}
        {#if preview.avatarUrl}<div>
            <dt>Photo</dt>
            <dd>Public GitHub profile photo</dd>
          </div>{/if}
      </dl>
      <p>
        Only empty fields will be filled. Email stays off your shared card unless you enable it.
      </p>
      <button class="button dark" type="button" onclick={apply}>Use this profile</button>
      <button class="button secondary" type="button" onclick={reset}>Cancel</button>
    </div>
  {/if}
  <p role="status">{message}</p>
</section>

<style>
  .profile-import {
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface-raised);
    margin-block: 1rem;
  }
  h3,
  h4 {
    margin: 0 0 0.5rem;
  }
  p {
    margin: 0.5rem 0;
  }
  form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem;
  }
  label {
    display: grid;
    gap: 0.4rem;
    flex: 1 1 16rem;
    min-width: 0;
  }
  input {
    width: 100%;
    box-sizing: border-box;
  }
  button {
    min-height: 44px;
  }
  .preview {
    margin-top: 1rem;
  }
  dl {
    margin: 0.75rem 0;
  }
  dl div {
    margin-block: 0.5rem;
  }
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0.2rem 0 0;
    overflow-wrap: anywhere;
  }
  [role='status']:empty {
    display: none;
  }
</style>
