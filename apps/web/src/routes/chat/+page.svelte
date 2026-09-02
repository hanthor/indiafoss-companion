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
  import { neutrinoMatrixId } from '@indiafoss/model';
  import { eventState, loadEvent } from '$lib/event.svelte';
  import { getMatrix, hydrateMatrix, matrixState, statusLabel } from '$lib/matrix.svelte';
  import { messagingConfigFor } from '$lib/messaging-config';
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

  const sessionRooms = $derived.by(() => {
    const prefix = `#${(config.aliasPrefix ?? eventState.bundle?.id ?? '').toLowerCase()}-`;
    return joinedRooms.filter((r) => r.alias?.startsWith(prefix));
  });
  const otherRooms = $derived(joinedRooms.filter((r) => !sessionRooms.includes(r)));

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
</script>

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
    {:else}
      <h2>No mesh node on this device</h2>
      <p class="muted small">
        P2P chat runs inside the Android app, which carries the Neutrino node (Bluetooth and Wi-Fi
        mesh). In a browser there is nothing to connect to.
      </p>
      {#if pendingOpen}
        <p class="pill amber">“{pendingOpen.name}” will open once the mesh is available.</p>
      {/if}
      <ConferenceRooms bundle={eventState.bundle} />
      <div class="actions">
        <button class="button secondary small" onclick={connectMesh}>Look again</button>
      </div>
      <p class="muted small">
        For regular Matrix rooms use
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a href="https://element.io/download" rel="noreferrer">Element</a> with the Matrix ids on contact
        cards.
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
      This session is on {matrixState.homeserver}, not the on-device mesh. Sign out to reconnect to
      the mesh node.
    </p>
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
          {opening ? 'Opening…' : 'Open chat'}
        </button>
        <button class="button secondary small" onclick={() => (pendingOpen = null)}>Cancel</button>
      </div>
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
    <p class="muted small">Rooms on the mesh are unencrypted; do not share secrets.</p>
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
</style>
