<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base, resolve } from '$app/paths';
  import { page } from '$app/state';
  import { parseMatrixTarget, matrixToUrl, localpart } from '@indiafoss/matrix';
  import type { PublicRoomSummary } from '@indiafoss/matrix';
  import type { MessagingRoom } from '@indiafoss/model';
  import { eventState, loadEvent } from '$lib/event.svelte';
  import { getMatrix, hydrateMatrix, matrixState, statusLabel } from '$lib/matrix.svelte';
  import { homeserverLabel, messagingConfigFor } from '$lib/messaging-config';
  import { contactsState, hydrateContacts } from '$lib/contacts.svelte';

  const config = $derived(messagingConfigFor(eventState.bundle));
  const signedIn = $derived(matrixState.status !== 'signed-out');
  const joinedRooms = $derived(matrixState.rooms.filter((r) => r.membership === 'join'));
  const invites = $derived(matrixState.rooms.filter((r) => r.membership === 'invite'));
  const joinedAliases = $derived(new Set(joinedRooms.map((r) => r.alias).filter(Boolean)));
  const matrixContacts = $derived(contactsState.contacts.filter((c) => c.matrixId));

  // Sign-in form
  let homeserver = $state('');
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let formError = $state<string | null>(null);

  // Join / DM forms
  let joinInput = $state('');
  let dmInput = $state('');
  let pendingDm = $state<string | null>(null);
  let search = $state('');
  let searchResults = $state<PublicRoomSummary[]>([]);
  let searching = $state(false);
  let actionError = $state<string | null>(null);

  onMount(async () => {
    void loadEvent();
    void hydrateContacts();
    await hydrateMatrix();
    homeserver ||= homeserverLabel(config.homeserver);

    const params = page.url.searchParams;
    const loginToken = params.get('loginToken');
    const pendingHs = sessionStorage.getItem('matrix-sso-homeserver');
    if (loginToken && pendingHs) {
      sessionStorage.removeItem('matrix-sso-homeserver');
      busy = true;
      try {
        await getMatrix().signInWithToken(pendingHs, loginToken);
        await goto(resolve('/chat'), { replaceState: true });
      } catch (error) {
        formError = error instanceof Error ? error.message : String(error);
      } finally {
        busy = false;
      }
    }
    const dm = params.get('dm');
    if (dm && parseMatrixTarget(dm)?.kind === 'user') pendingDm = parseMatrixTarget(dm)!.id;
    const join = params.get('join');
    if (join) joinInput = join;
  });

  async function signIn(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    formError = null;
    try {
      await getMatrix().signInWithPassword(homeserver, username, password);
      password = '';
    } catch (error) {
      formError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  async function signInWithSso() {
    busy = true;
    formError = null;
    try {
      const redirect = new URL(`${base}/chat`, window.location.origin).toString();
      const url = await getMatrix().ssoStartUrl(homeserver, redirect);
      const m = await import('@indiafoss/matrix');
      sessionStorage.setItem('matrix-sso-homeserver', await m.MatrixClient.discover(homeserver));
      window.location.assign(url);
    } catch (error) {
      formError = error instanceof Error ? error.message : String(error);
      busy = false;
    }
  }

  async function signOut() {
    busy = true;
    try {
      await getMatrix().signOut();
    } finally {
      busy = false;
    }
  }

  async function join(idOrAlias: string) {
    actionError = null;
    const target = parseMatrixTarget(idOrAlias);
    if (!target || target.kind === 'user') {
      actionError = 'Enter a room alias like #hallway:matrix.org or a matrix.to room link.';
      return;
    }
    busy = true;
    try {
      const roomId = await getMatrix().joinRoom(target.id);
      joinInput = '';
      await goto(resolve(`/chat/${encodeURIComponent(roomId)}`));
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  function requestDm(input: string) {
    actionError = null;
    const target = parseMatrixTarget(input);
    if (!target || target.kind !== 'user') {
      actionError = 'Enter a Matrix user id like @alice:matrix.org.';
      return;
    }
    pendingDm = target.id;
  }

  async function confirmDm() {
    if (!pendingDm) return;
    busy = true;
    actionError = null;
    try {
      const roomId = await getMatrix().openDirectMessage(pendingDm);
      pendingDm = null;
      dmInput = '';
      await goto(resolve(`/chat/${encodeURIComponent(roomId)}`));
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  async function runSearch(event: SubmitEvent) {
    event.preventDefault();
    if (search.trim().length < 2) return;
    searching = true;
    actionError = null;
    try {
      searchResults = await getMatrix().searchPublicRooms(search.trim());
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      searching = false;
    }
  }

  const isJoined = (room: MessagingRoom) => joinedAliases.has(room.alias);
</script>

<h1>Chat</h1>
<p class="muted">
  Optional Matrix messaging for conference rooms and one-to-one conversations. The schedule, map and
  ranking never need it.
</p>

{#if !matrixState.hydrated}
  <p class="muted small" role="status">Restoring session…</p>
{:else if !signedIn}
  <section class="card">
    <h2>Sign in to Matrix</h2>
    <p class="muted small">
      Use any Matrix account (for example on {homeserverLabel(config.homeserver)}). Your access
      token stays in this browser; nothing is sent anywhere except your homeserver.
    </p>
    {#if matrixState.error}<p class="error" role="alert">{matrixState.error}</p>{/if}
    <form onsubmit={signIn} class="form">
      <label>
        Homeserver
        <input name="homeserver" bind:value={homeserver} autocomplete="url" required />
      </label>
      <label>
        Username
        <input
          name="username"
          bind:value={username}
          autocomplete="username"
          placeholder="alice or @alice:matrix.org"
          required
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          bind:value={password}
          autocomplete="current-password"
          required
        />
      </label>
      {#if formError}<p class="error" role="alert">{formError}</p>{/if}
      <div class="actions">
        <button class="primary" type="submit" disabled={busy}>Sign in</button>
        <button type="button" onclick={signInWithSso} disabled={busy}>Sign in with SSO</button>
      </div>
    </form>
    <p class="muted small">
      No account? Create one on the homeserver of your choice, or use
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href="https://matrix.org/ecosystem/clients/" rel="noreferrer">any Matrix client</a>
      with the same rooms.
    </p>
  </section>
{:else}
  <section class="status" aria-live="polite">
    <span class="dot {matrixState.status}"></span>
    <span>{statusLabel(matrixState.status)}</span>
    {#if matrixState.outbox.length > 0}
      <span class="pill">{matrixState.outbox.length} queued</span>
    {/if}
    <span class="spacer"></span>
    <span class="muted small">{matrixState.displayName ?? localpart(matrixState.userId ?? '')}</span
    >
    <button class="link" onclick={signOut} disabled={busy}>Sign out</button>
  </section>
  {#if matrixState.error}<p class="error" role="alert">{matrixState.error}</p>{/if}
  {#if actionError}<p class="error" role="alert">{actionError}</p>{/if}

  {#if pendingDm}
    <section class="card confirm" aria-labelledby="dm-title">
      <h2 id="dm-title">Start a direct message?</h2>
      <p>
        With <strong>{pendingDm}</strong>. A scanned or pasted id is an identifier exchange, not
        proof of identity — this person is <em>unverified</em> until you verify them in a full Matrix
        client.
      </p>
      <div class="actions">
        <button class="primary" onclick={confirmDm} disabled={busy}>Start conversation</button>
        <button onclick={() => (pendingDm = null)}>Cancel</button>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href={matrixToUrl(pendingDm)} rel="noreferrer">Open in Element instead</a>
      </div>
    </section>
  {/if}

  {#if invites.length > 0}
    <section>
      <h2>Invitations</h2>
      <ul class="rooms">
        {#each invites as room (room.roomId)}
          <li>
            <div>
              <strong>{room.name}</strong>
              <p class="muted small">You have been invited.</p>
            </div>
            <button class="primary" onclick={() => join(room.roomId)} disabled={busy}>Accept</button
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if config.rooms.length > 0}
    <section>
      <h2>Conference rooms</h2>
      <ul class="rooms">
        {#each config.rooms as room (room.alias)}
          <li>
            <div>
              <strong>{room.name}</strong>
              <p class="muted small">{room.purpose ?? room.alias}</p>
            </div>
            {#if isJoined(room)}
              <a
                class="button"
                href={resolve(
                  `/chat/${encodeURIComponent(joinedRooms.find((r) => r.alias === room.alias)!.roomId)}`,
                )}>Open</a
              >
            {:else}
              <button onclick={() => join(room.alias)} disabled={busy}>Join</button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section>
    <h2>Your rooms</h2>
    {#if joinedRooms.length === 0}
      <p class="muted">
        No rooms yet. Join a conference room, search the directory, or start a direct message.
      </p>
    {:else}
      <ul class="rooms">
        {#each joinedRooms as room (room.roomId)}
          <li>
            <a class="roomlink" href={resolve(`/chat/${encodeURIComponent(room.roomId)}`)}>
              <strong>{room.name}</strong>
              <span class="muted small">
                {room.isDirect ? 'Direct message' : (room.alias ?? 'Room')}{room.encrypted
                  ? ' · encrypted'
                  : ''}
              </span>
            </a>
            {#if room.unread > 0}<span class="badge" aria-label="{room.unread} unread"
                >{room.unread}</span
              >{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card">
    <h2>Direct message</h2>
    <form
      class="inline"
      onsubmit={(e) => {
        e.preventDefault();
        requestDm(dmInput);
      }}
    >
      <input
        aria-label="Matrix user id"
        bind:value={dmInput}
        placeholder="@alice:matrix.org or matrix.to link"
      />
      <button type="submit" disabled={busy}>Message</button>
    </form>
    {#if matrixContacts.length > 0}
      <p class="muted small">Saved contacts</p>
      <ul class="chips">
        {#each matrixContacts as contact (contact.id)}
          <li>
            <button class="chip" onclick={() => requestDm(contact.matrixId!)}
              >{contact.fullName}</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    <p class="muted small"><a href={resolve('/scan')}>Scan a contact QR code</a> to add people.</p>
  </section>

  <section class="card">
    <h2>Join a room</h2>
    <form
      class="inline"
      onsubmit={(e) => {
        e.preventDefault();
        void join(joinInput);
      }}
    >
      <input aria-label="Room alias" bind:value={joinInput} placeholder="#hallway:matrix.org" />
      <button type="submit" disabled={busy}>Join</button>
    </form>
    <form class="inline" onsubmit={runSearch}>
      <input
        aria-label="Search public rooms"
        type="search"
        bind:value={search}
        placeholder="Search the room directory…"
      />
      <button type="submit" disabled={searching}>Search</button>
    </form>
    {#if searchResults.length > 0}
      <ul class="rooms">
        {#each searchResults as room (room.roomId)}
          <li>
            <div>
              <strong>{room.name ?? room.alias ?? room.roomId}</strong>
              <p class="muted small">{room.topic ?? room.alias ?? ''} · {room.members} members</p>
            </div>
            <button onclick={() => join(room.alias ?? room.roomId)} disabled={busy}>Join</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
  }
  .card {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin: 1rem 0;
  }
  .card h2,
  section h2 {
    font-size: 1.05rem;
    margin: 0 0 0.5rem;
  }
  .confirm {
    border: 2px solid var(--event-accent);
    background: color-mix(in srgb, var(--event-accent) 12%, var(--surface));
  }
  .form {
    display: grid;
    gap: 0.75rem;
  }
  .form label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.85rem;
  }
  input {
    padding: 0.55rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 40%, transparent);
    border-radius: var(--radius);
    width: 100%;
    background: var(--surface);
  }
  .inline {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }
  button,
  .button {
    border: 1px solid color-mix(in srgb, var(--text-muted) 40%, transparent);
    background: var(--surface);
    border-radius: 999px;
    padding: 0.45rem 1rem;
    min-height: 40px;
    cursor: pointer;
    text-decoration: none;
    color: var(--text);
    display: inline-flex;
    align-items: center;
  }
  button.primary {
    background: var(--event-primary);
    border-color: var(--event-primary);
    color: #fff;
    font-weight: 600;
  }
  button.link {
    border: none;
    background: none;
    color: var(--event-primary-dark);
    padding: 0.2rem 0.4rem;
    min-height: 0;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    margin: 0.5rem 0 1rem;
  }
  .spacer {
    flex: 1;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--text-muted);
  }
  .dot.online {
    background: var(--success);
  }
  .dot.offline,
  .dot.error {
    background: var(--warning);
  }
  .pill,
  .badge {
    background: var(--event-accent);
    color: var(--event-secondary);
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
    font-size: 0.75rem;
    font-weight: 700;
  }
  .rooms {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.4rem;
  }
  .rooms li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 20%, transparent);
    border-radius: var(--radius);
  }
  .rooms p {
    margin: 0.1rem 0 0;
  }
  .roomlink {
    display: flex;
    flex-direction: column;
    text-decoration: none;
    color: inherit;
    flex: 1;
    min-width: 0;
  }
  .roomlink strong,
  .rooms strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chips {
    list-style: none;
    padding: 0;
    margin: 0 0 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    min-height: 32px;
    padding: 0.2rem 0.7rem;
    font-size: 0.85rem;
  }
</style>
