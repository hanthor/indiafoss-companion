<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { localpart, matrixToUrl } from '@indiafoss/matrix';
  import { formatTime } from '@indiafoss/schedule';
  import { getMatrix, hydrateMatrix, matrixState, roomById, statusLabel } from '$lib/matrix.svelte';

  const roomId = $derived(decodeURIComponent(page.params.roomId ?? ''));
  const room = $derived(roomById(roomId));
  const timeline = $derived(matrixState.timelines[roomId] ?? []);
  const queued = $derived(new Set(matrixState.outbox.map((o) => o.txnId)));
  const selfId = $derived(matrixState.userId);

  let draft = $state('');
  let sending = $state(false);
  let loadingOlder = $state(false);
  let error = $state<string | null>(null);
  let list = $state<HTMLElement | null>(null);

  onMount(async () => {
    await hydrateMatrix();
    if (matrixState.status === 'signed-out') {
      await goto(resolve('/chat'), { replaceState: true });
      return;
    }
    await getMatrix().openRoom(roomId);
    await getMatrix().markRead(roomId);
    await tick();
    list?.scrollTo({ top: list.scrollHeight });
  });

  $effect(() => {
    // Keep the newest message in view and the room marked read while open.
    void timeline.length;
    void tick().then(() => list?.scrollTo({ top: list.scrollHeight }));
    if (room && room.unread > 0) void getMatrix().markRead(roomId);
  });

  async function send(event: SubmitEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sending = true;
    error = null;
    try {
      draft = '';
      await getMatrix().sendMessage(roomId, text);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      sending = false;
    }
  }

  async function loadOlder() {
    loadingOlder = true;
    try {
      await getMatrix().loadOlder(roomId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loadingOlder = false;
    }
  }

  async function leave() {
    if (!confirm('Leave this room?')) return;
    try {
      await getMatrix().leaveRoom(roomId);
      await goto(resolve('/chat'));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const senderName = (id: string) => room?.memberNames[id] ?? localpart(id);
  const timeOf = (ts: number) => (ts ? formatTime(new Date(ts).toISOString()) : '');
</script>

<nav class="crumbs"><a href={resolve('/chat')}>← Chat</a></nav>

{#if !room}
  <p class="muted">Room not found in this session.</p>
{:else}
  <header class="roomhead">
    <div>
      <h1>{room.name}</h1>
      <p class="muted small">
        {room.isDirect ? 'Direct message' : (room.alias ?? room.roomId)}
        {#if room.topic}· {room.topic}{/if}
      </p>
    </div>
    <div class="headactions">
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href={matrixToUrl(room.alias ?? room.roomId)} rel="noreferrer">Open in Element</a>
      <button class="button ghost small danger" onclick={leave}>Leave</button>
    </div>
  </header>

  {#if room.encrypted}
    <p class="notice" role="note">
      This room is end-to-end encrypted. The companion can only show unencrypted messages; open the
      room in a full Matrix client to read and send encrypted ones.
    </p>
  {/if}

  <p class="statusline" aria-live="polite">
    <span class="dot {matrixState.status}"></span>
    {statusLabel(matrixState.status)}
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <section class="timeline" bind:this={list} aria-label="Messages">
    {#if room.prevBatch}
      <button class="older" onclick={loadOlder} disabled={loadingOlder}>
        {loadingOlder ? 'Loading…' : 'Load older messages'}
      </button>
    {/if}
    {#if timeline.length === 0}
      <p class="muted small center">No messages yet.</p>
    {/if}
    {#each timeline as event (event.eventId)}
      {@const mine = event.sender === selfId}
      {@const pending = event.txnId ? queued.has(event.txnId) : false}
      <article
        class="msg"
        class:mine
        class:pending
        class:notice={event.msgtype === 'm.notice' || event.msgtype === 'm.encrypted'}
      >
        {#if !mine}<span class="sender">{senderName(event.sender)}</span>{/if}
        <p class="body">
          {event.msgtype === 'm.emote' ? `* ${senderName(event.sender)} ${event.body}` : event.body}
        </p>
        <span class="meta">{pending ? 'Sending…' : timeOf(event.ts)}</span>
      </article>
    {/each}
  </section>

  <form class="composer" onsubmit={send}>
    <input
      aria-label="Message"
      bind:value={draft}
      placeholder={room.encrypted ? 'Encrypted room — open in Element to send' : 'Message…'}
      disabled={room.encrypted || room.membership !== 'join'}
      autocomplete="off"
      enterkeyhint="send"
    />
    <button
      class="button primary"
      type="submit"
      disabled={sending || room.encrypted || !draft.trim()}>Send</button
    >
  </form>
  {#if matrixState.status !== 'online'}
    <p class="muted small">You're offline: messages are queued and delivered when you reconnect.</p>
  {/if}
{/if}

<style>
  .center {
    text-align: center;
  }
  .error {
    color: var(--danger);
  }
  .crumbs {
    font-size: 0.85rem;
    margin-bottom: 0.3rem;
  }
  .roomhead {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .roomhead h1 {
    font-size: 1.2rem;
    margin: 0.2rem 0 0.1rem;
    overflow-wrap: anywhere;
  }
  .roomhead p {
    margin: 0;
  }
  .headactions {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .notice {
    background: color-mix(in srgb, var(--warning) 12%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
    border-radius: var(--radius);
    padding: 0.5rem 0.8rem;
    font-size: 0.85rem;
  }
  .statusline {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0.3rem 0;
  }
  .dot {
    width: 0.55rem;
    height: 0.55rem;
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
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    height: min(60dvh, 34rem);
    overflow-y: auto;
    padding: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 20%, transparent);
    border-radius: var(--radius);
    background: var(--surface-raised);
  }
  .older {
    align-self: center;
    border: none;
    background: none;
    color: var(--event-primary-dark);
    cursor: pointer;
    padding: 0.3rem;
    font-size: 0.85rem;
  }
  .msg {
    max-width: 82%;
    align-self: flex-start;
    background: var(--surface);
    border-radius: 0.9rem;
    padding: 0.45rem 0.7rem;
    display: flex;
    flex-direction: column;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  }
  .msg.mine {
    align-self: flex-end;
    background: color-mix(in srgb, var(--event-primary) 18%, var(--surface));
  }
  .msg.pending {
    opacity: 0.65;
  }
  .msg.notice .body {
    font-style: italic;
    color: var(--text-muted);
  }
  .sender {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--event-primary-dark);
  }
  .body {
    margin: 0.1rem 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .meta {
    font-size: 0.7rem;
    color: var(--text-muted);
    align-self: flex-end;
  }
  .composer {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }
  .composer input {
    flex: 1;
    padding: 0.6rem 0.8rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 40%, transparent);
    border-radius: 999px;
  }
</style>
