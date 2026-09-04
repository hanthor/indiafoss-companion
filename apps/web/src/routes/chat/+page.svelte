<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    isLoopbackHomeserver,
    parseMatrixTarget,
    matrixToUrl,
    localpart,
  } from '@indiafoss/matrix';
  import { announcementsRoom, neutrinoMatrixId } from '@indiafoss/model';
  import { eventState, loadEvent } from '$lib/event.svelte';
  import { getMatrix, hydrateMatrix, matrixState, statusLabel } from '$lib/matrix.svelte';
  import { hydrateProfile, profileState, saveProfile } from '$lib/profile.svelte';
  import { homeserverLabel, messagingConfigFor } from '$lib/messaging-config';
  import ConferenceRooms from '$lib/components/ConferenceRooms.svelte';
  import { contactsState, hydrateContacts } from '$lib/contacts.svelte';
  import { features, hydrateFeatures, setChatEnabled } from '$lib/features.svelte';
  import { meshPeers, shortServerName, startMeshNode } from '$lib/neutrino';
  import type { MeshNode, NeutrinoPeer } from '$lib/neutrino';

  /** Placeholder credentials: the embedded node does no client-server auth (single user "n"). */
  const MESH_LOCALPART = 'n';
  const MESH_PASSWORD = 'neutrino';
  const PEER_REFRESH_MS = 10_000;

  const config = $derived(messagingConfigFor(eventState.bundle));
  const signedIn = $derived(matrixState.status !== 'signed-out');
  const onMesh = $derived(!!matrixState.homeserver && isLoopbackHomeserver(matrixState.homeserver));
  const joinedRooms = $derived(matrixState.rooms.filter((r) => r.membership === 'join'));
  const invites = $derived(matrixState.rooms.filter((r) => r.membership === 'invite'));
  const meshContacts = $derived(contactsState.contacts.filter((c) => c.neutrinoServerName));

  let mesh = $state<MeshNode | null>(null);
  let meshSearching = $state(false);
  let peers = $state<NeutrinoPeer[]>([]);
  let busy = $state(false);
  let signInError = $state<string | null>(null);
  let joinInput = $state('');
  let dmInput = $state('');
  let pendingDm = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  /** Session/booth/venue chat requested via ?open= (joined or created on demand). */
  let pendingOpen = $state<{ alias: string; name: string; topic?: string } | null>(null);
  let opening = $state(false);
  let peerTimer: ReturnType<typeof setInterval> | null = null;
  /** Issue #111: publishing this phone's mesh identity on the internet account. */
  let linkState = $state<'idle' | 'busy' | 'done' | 'error'>('idle');
  let linkError = $state<string | null>(null);
  const meshIdentity = $derived(profileState.profile.neutrinoServerName?.trim() || null);
  const linkedAlready = $derived(
    !!matrixState.userId && profileState.profile.matrixId?.trim() === matrixState.userId,
  );

  async function linkMeshIdentity() {
    if (!meshIdentity || !matrixState.userId) return;
    linkState = 'busy';
    linkError = null;
    try {
      await getMatrix().publishMeshIdentity(meshIdentity);
      profileState.profile.matrixId = matrixState.userId;
      profileState.selection.matrixId = true;
      await saveProfile();
      linkState = 'done';
    } catch (error) {
      linkState = 'error';
      linkError = error instanceof Error ? error.message : String(error);
    }
  }

  const sessionRooms = $derived.by(() => {
    const prefix = `#${(config.aliasPrefix ?? eventState.bundle?.id ?? '').toLowerCase()}-`;
    return joinedRooms.filter((r) => r.alias?.startsWith(prefix));
  });
  /** Issue #113: the organiser-owned room, pinned first. */
  const announcements = $derived(announcementsRoom(config, eventState.bundle?.id ?? ''));
  const announcementsJoined = $derived(
    announcements ? joinedRooms.find((r) => r.alias === announcements.alias) : undefined,
  );
  const otherRooms = $derived(
    joinedRooms.filter((r) => !sessionRooms.includes(r) && r !== announcementsJoined),
  );
  let joiningAnnouncements = $state(false);

  async function joinAnnouncements() {
    if (!announcements) return;
    joiningAnnouncements = true;
    actionError = null;
    try {
      const roomId = await getMatrix().joinOrCreateRoom({ ...announcements, announcements: true });
      await goto(resolve(`/chat/${encodeURIComponent(roomId)}`));
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      joiningAnnouncements = false;
    }
  }

  async function refreshPeers() {
    peers = await meshPeers();
  }

  async function accept(roomId: string) {
    busy = true;
    actionError = null;
    try {
      await getMatrix().acceptInvite(roomId);
    } catch (e) {
      actionError = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function decline(roomId: string) {
    busy = true;
    actionError = null;
    try {
      await getMatrix().declineInvite(roomId);
    } catch (e) {
      actionError = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function connectMesh() {
    meshSearching = true;
    signInError = null;
    try {
      mesh = await startMeshNode();
      if (mesh && !signedIn) {
        await getMatrix().signInWithPassword(mesh.baseUrl, MESH_LOCALPART, MESH_PASSWORD);
      }
    } catch (error) {
      signInError = error instanceof Error ? error.message : String(error);
    } finally {
      meshSearching = false;
    }
    if (mesh?.native) {
      await refreshPeers();
      peerTimer ??= setInterval(() => void refreshPeers(), PEER_REFRESH_MS);
    }
  }

  async function enable() {
    await setChatEnabled(true);
    await hydrateMatrix();
    await connectMesh();
  }

  async function openConference() {
    if (!pendingOpen) return;
    opening = true;
    actionError = null;
    try {
      const roomId = await getMatrix().joinOrCreateRoom(pendingOpen);
      pendingOpen = null;
      await goto(resolve(`/chat/${encodeURIComponent(roomId)}`));
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      opening = false;
    }
  }

  onMount(async () => {
    void loadEvent();
    void hydrateContacts();
    void hydrateProfile();
    await hydrateFeatures();
    if (!features.chat) return;
    await hydrateMatrix();

    const params = page.url.searchParams;
    const dm = params.get('dm');
    if (dm && parseMatrixTarget(dm)?.kind === 'user') pendingDm = parseMatrixTarget(dm)!.id;
    const join = params.get('join');
    if (join) joinInput = join;
    const open = params.get('open');
    if (open && parseMatrixTarget(open)?.kind === 'alias') {
      pendingOpen = {
        alias: open,
        name: params.get('name') ?? open,
        topic: params.get('topic') ?? undefined,
      };
    }
    await connectMesh();
  });

  onDestroy(() => {
    if (peerTimer) clearInterval(peerTimer);
  });

  const sessionChatLabel = (alias: string | undefined): string => {
    const kind = alias?.match(/-(session|booth|room)-/)?.[1];
    return kind === 'session'
      ? 'Session chat'
      : kind === 'booth'
        ? 'Booth chat'
        : kind === 'room'
          ? 'Venue room'
          : 'Room';
  };

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
      actionError = 'Enter a room alias like #hallway:… or a room id.';
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
      actionError = 'Enter a mesh user id like @n:<node id>, or pick a nearby peer.';
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

  const peerLabel = (p: NeutrinoPeer) => p.displayName || shortServerName(p.serverName);

  /** Issue #115: take part from anywhere with an ordinary Matrix account. */
  let ownHomeserver = $state('');
  let ownUser = $state('');
  let ownPassword = $state('');
  let ownSigningIn = $state(false);
  let ownError = $state<string | null>(null);
  const homeserverPlaceholder = $derived(homeserverLabel(config.homeserver));

  async function signInWithOwnAccount(event: SubmitEvent) {
    event.preventDefault();
    ownError = null;
    const user = ownUser.trim();
    if (!user || !ownPassword) {
      ownError = 'Enter your Matrix user name and password.';
      return;
    }
    // A full id names its own server; otherwise the conference homeserver.
    const idServer = user.match(/^@[^:]+:(.+)$/)?.[1];
    const homeserver = ownHomeserver.trim() || idServer || config.homeserver;
    ownSigningIn = true;
    try {
      await hydrateMatrix();
      await getMatrix().signInWithPassword(homeserver, user, ownPassword);
      ownPassword = '';
    } catch (error) {
      ownError = error instanceof Error ? error.message : String(error);
    } finally {
      ownSigningIn = false;
    }
  }
</script>

{#snippet ownAccountForm()}
  <details class="own">
    <summary>Join from anywhere with your own Matrix account</summary>
    <p class="muted small">
      The conference rooms live on {homeserverPlaceholder}. Sign in there, or with any Matrix
      account you already have: rooms on the conference server join by alias from anywhere.
    </p>
    <form class="stack" onsubmit={signInWithOwnAccount}>
      <label>
        <span class="muted small">Homeserver</span>
        <input
          bind:value={ownHomeserver}
          placeholder={homeserverPlaceholder}
          autocomplete="url"
          inputmode="url"
        />
      </label>
      <label>
        <span class="muted small">User</span>
        <input
          bind:value={ownUser}
          placeholder="alice or @alice:matrix.org"
          autocomplete="username"
        />
      </label>
      <label>
        <span class="muted small">Password</span>
        <input bind:value={ownPassword} type="password" autocomplete="current-password" />
      </label>
      {#if ownError}<p class="error" role="alert">{ownError}</p>{/if}
      <button class="button secondary" type="submit" disabled={ownSigningIn}>
        {ownSigningIn ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  </details>
{/snippet}

<h1>Chat</h1>
<p class="muted">
  Peer-to-peer chat with people at the venue: session and booth rooms, and direct messages, over
  Bluetooth and Wi-Fi mesh. No account, no public server. The schedule, map and ranking never need
  it.
</p>

{#if !features.loaded}
  <p class="muted small" role="status">Loading…</p>
{:else if !features.chat}
  <ConferenceRooms bundle={eventState.bundle} />
  <section class="card">
    <h2>P2P chat is off</h2>
    <p class="muted small">
      Android app only: it runs a mesh node on this phone and talks to nearby attendees over
      Bluetooth and Wi-Fi. Nothing is started or sent until you switch it on.
    </p>
    <div class="actions">
      <button class="button primary" onclick={enable}>Enable P2P chat</button>
      <a class="button secondary small" href={resolve('/settings')}>Settings</a>
    </div>
    <p class="muted small">
      Looking for a regular Matrix room? Contact cards and speaker profiles link Matrix ids that
      open in <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href="https://element.io/download" rel="noreferrer">Element</a>.
    </p>
  </section>
{:else if !matrixState.hydrated || meshSearching}
  <p class="muted small" role="status">
    {meshSearching ? 'Starting the mesh node on this device…' : 'Restoring session…'}
  </p>
{:else if !signedIn}
  <section class="card">
    {#if mesh}
      <h2>Could not join the mesh node</h2>
      {#if signInError}<p class="error" role="alert">{signInError}</p>{/if}
      {#if matrixState.error}<p class="error" role="alert">{matrixState.error}</p>{/if}
      <div class="actions">
        <button class="button primary" onclick={connectMesh} disabled={busy}>Try again</button>
      </div>
      {@render ownAccountForm()}
    {:else}
      <h2>No mesh node on this device</h2>
      <p class="muted small">
        P2P chat runs inside the Android app, which carries the Neutrino node (Bluetooth and Wi-Fi
        mesh). In a browser there is nothing to connect to.
      </p>
      {#if pendingOpen}
        <p class="pill amber">“{pendingOpen.name}” will open once the mesh is available.</p>
      {/if}
      {@render ownAccountForm()}
      <ConferenceRooms bundle={eventState.bundle} />
      <div class="actions">
        <button class="button secondary small" onclick={connectMesh}>Look again</button>
      </div>
      <p class="muted small">
        Prefer another client? Use
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href="https://element.io/download" rel="noreferrer">Element</a> with the same account; the
        rooms are ordinary Matrix rooms.
      </p>
    {/if}
  </section>
{:else}
  <section class="status" aria-live="polite">
    <span class="dot {matrixState.status}"></span>
    <span>{statusLabel(matrixState.status)}</span>
    {#if matrixState.outbox.length > 0}
      <span class="pill">{matrixState.outbox.length} queued</span>
    {/if}
    <span class="spacer"></span>
    <span class="muted small" title={matrixState.userId ?? ''}>
      {matrixState.displayName ?? localpart(matrixState.userId ?? '')}
      {#if mesh?.serverName}· node {shortServerName(mesh.serverName)}{/if}
    </span>
    <button class="button ghost small" onclick={signOut} disabled={busy}>Sign out</button>
  </section>
  {#if !onMesh}
    <p class="pill amber">
      Signed in on {matrixState.homeserver}: the conference rooms, from anywhere. Sign out to use
      the on-device mesh instead.
    </p>
    {#if meshIdentity}
      <section class="linkbox" aria-label="Link this account to your mesh identity">
        {#if linkState === 'done' || linkedAlready}
          <p class="muted small">
            ✓ {matrixState.userId} is linked to your mesh identity. People who scan your card can verify
            it against this account.
          </p>
          {#if linkState !== 'done'}
            <button
              class="button ghost small"
              onclick={linkMeshIdentity}
              disabled={linkState === 'busy'}
            >
              Publish again
            </button>
          {/if}
        {:else}
          <p class="muted small">
            Let people you meet on the mesh verify that {matrixState.userId} is you: this publishes your
            mesh node id on this account's profile. Nothing from your conversations leaves the phone.
          </p>
          <button class="button small" onclick={linkMeshIdentity} disabled={linkState === 'busy'}>
            {linkState === 'busy' ? 'Publishing…' : 'Link this account to my mesh identity'}
          </button>
        {/if}
        {#if linkError}<p class="error" role="alert">{linkError}</p>{/if}
      </section>
    {/if}
  {/if}
  {#if matrixState.error}<p class="error" role="alert">{matrixState.error}</p>{/if}
  {#if actionError}<p class="error" role="alert">{actionError}</p>{/if}

  {#if pendingOpen}
    <section class="card accent confirm" aria-labelledby="open-title">
      <h2 id="open-title">Open “{pendingOpen.name}”?</h2>
      <p class="muted small">
        {pendingOpen.topic ?? ''} Room <code>{pendingOpen.alias}</code> is created on demand on the mesh:
        the first person to open it creates it, everyone nearby joins the same one. Joining reveals your
        mesh id to its members.
      </p>
      <div class="actions">
        <button class="button primary" onclick={openConference} disabled={opening}>
          {opening ? 'Joining…' : 'Open chat'}
        </button>
        <button class="button secondary small" onclick={() => (pendingOpen = null)}>Cancel</button>
      </div>
      {#if opening}
        <!-- The client waits a random moment first, so a room a whole talk opens
             at once is not joined by everyone in the same second (#120). -->
        <p class="muted small" role="status">
          Taking a moment on purpose: when a talk starts everyone opens this room at once, and the
          mesh lands the joins better spread out.
        </p>
      {/if}
    </section>
  {/if}

  {#if pendingDm}
    <section class="card accent confirm" aria-labelledby="dm-title">
      <h2 id="dm-title">Start a direct message?</h2>
      <p>
        With <strong>{pendingDm}</strong>. A scanned or pasted id is an identifier exchange, not
        proof of identity: this person is <em>unverified</em> until you compare key badges in person.
      </p>
      <div class="actions">
        <button class="button primary" onclick={confirmDm} disabled={busy}
          >Start conversation</button
        >
        <button class="button secondary small" onclick={() => (pendingDm = null)}>Cancel</button>
        {#if !pendingDm.startsWith(`@${MESH_LOCALPART}:`)}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={matrixToUrl(pendingDm)} rel="noreferrer">Open in Element instead</a>
        {/if}
      </div>
    </section>
  {/if}

  {#if mesh?.native}
    <section>
      <h2>Nearby</h2>
      {#if peers.length === 0}
        <p class="muted small">
          No peers found yet. Others need the app open with P2P chat on; Bluetooth discovery takes a
          moment.
        </p>
      {:else}
        <ul class="rooms">
          {#each peers as peer (peer.serverName)}
            <li>
              <div>
                <strong>{peerLabel(peer)}</strong>
                <p class="muted small"><code>{shortServerName(peer.serverName)}</code></p>
              </div>
              <button
                class="button secondary small"
                onclick={() => requestDm(neutrinoMatrixId(peer.serverName))}
                disabled={busy}>Message</button
              >
            </li>
          {/each}
        </ul>
      {/if}
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
            <div class="inviteactions">
              <button class="button primary" onclick={() => accept(room.roomId)} disabled={busy}
                >Accept</button
              >
              <button
                class="button secondary small"
                onclick={() => decline(room.roomId)}
                disabled={busy}>Decline</button
              >
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if announcements}
    <section class="pinned" aria-label="Announcements">
      <ul class="rooms">
        <li>
          {#if announcementsJoined}
            <a
              class="roomlink"
              href={resolve(`/chat/${encodeURIComponent(announcementsJoined.roomId)}`)}
            >
              <strong>📣 {announcementsJoined.name || announcements.name}</strong>
              <span class="muted small">From the organisers · read-only</span>
            </a>
            {#if announcementsJoined.unread > 0}<span
                class="badge"
                aria-label="{announcementsJoined.unread} unread">{announcementsJoined.unread}</span
              >{/if}
          {:else}
            <span class="roomlink">
              <strong>📣 {announcements.name}</strong>
              <span class="muted small">Schedule changes and room moves, from the organisers</span>
            </span>
            <button
              class="button small"
              onclick={joinAnnouncements}
              disabled={busy || joiningAnnouncements}
            >
              {joiningAnnouncements ? 'Joining…' : 'Join'}
            </button>
          {/if}
        </li>
      </ul>
    </section>
  {/if}

  {#if sessionRooms.length > 0}
    <section>
      <h2>Session, booth and venue chats</h2>
      <ul class="rooms">
        {#each sessionRooms as room (room.roomId)}
          <li>
            <a class="roomlink" href={resolve(`/chat/${encodeURIComponent(room.roomId)}`)}>
              <strong>{room.name}</strong>
              <span class="muted small">{sessionChatLabel(room.alias)}</span>
            </a>
            {#if room.unread > 0}<span class="badge" aria-label="{room.unread} unread"
                >{room.unread}</span
              >{/if}
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p class="muted small">
      Session and booth chats open from the <a href={resolve('/schedule')}>schedule</a>, a session
      page or a booth page.
    </p>
  {/if}

  <section>
    <h2>Your rooms</h2>
    {#if otherRooms.length === 0}
      <p class="muted">No conversations yet. Message a nearby peer or a saved contact.</p>
    {:else}
      <ul class="rooms">
        {#each otherRooms as room (room.roomId)}
          <li>
            <a class="roomlink" href={resolve(`/chat/${encodeURIComponent(room.roomId)}`)}>
              <strong>{room.name}</strong>
              <span class="muted small">
                {room.isDirect ? 'Direct message' : (room.alias ?? 'Room')}
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
      <input aria-label="Mesh user id" bind:value={dmInput} placeholder="@n:<node id>" />
      <button class="button secondary small" type="submit" disabled={busy}>Message</button>
    </form>
    {#if meshContacts.length > 0}
      <p class="muted small">Saved contacts on the mesh</p>
      <ul class="chips">
        {#each meshContacts as contact (contact.id)}
          <li>
            <button
              class="button secondary small"
              onclick={() => requestDm(neutrinoMatrixId(contact.neutrinoServerName!))}
              >{contact.fullName}</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    <p class="muted small">
      <a href={resolve('/scan')}>Scan a contact card</a> to add people; cards carry their mesh id when
      they chose to share it.
    </p>
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
      <input aria-label="Room alias" bind:value={joinInput} placeholder="#hallway:<node id>" />
      <button class="button secondary small" type="submit" disabled={busy}>Join</button>
    </form>
    {#if matrixState.encryptionReady}
      <p class="muted small">
        Direct messages on the mesh are end-to-end encrypted. Conference rooms are not, so people
        who join later can read what was said.
      </p>
    {:else}
      <p class="muted small">Rooms on the mesh are unencrypted; do not share secrets.</p>
    {/if}
  </section>
{/if}

<style>
  .inviteactions {
    display: flex;
    gap: 0.35rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
  }
  .confirm {
    border: 2px solid var(--event-accent);
    background: color-mix(in srgb, var(--event-accent) 12%, var(--surface));
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
  .pill.amber {
    display: inline-block;
    margin: 0 0 0.8rem;
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
  .own {
    margin: 0.75rem 0;
  }
  .own summary {
    cursor: pointer;
    font-weight: 600;
  }
  .stack {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .stack label {
    display: grid;
    gap: 0.15rem;
  }
</style>
