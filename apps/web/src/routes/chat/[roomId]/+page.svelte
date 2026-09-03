<script lang="ts">
  import { contactsState, hydrateContacts } from '$lib/contacts.svelte';
  import { contactForMeshUser } from '$lib/mesh-link';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { localpart, matrixToUrl, meshLinkLabel, canPost } from '@indiafoss/matrix';
  import { formatTime } from '@indiafoss/schedule';
  import { getMatrix, hydrateMatrix, matrixState, roomById, statusLabel } from '$lib/matrix.svelte';
  import MediaAttachment from '$lib/components/MediaAttachment.svelte';

  const roomId = $derived(decodeURIComponent(page.params.roomId ?? ''));
  const room = $derived(roomById(roomId));
  const timeline = $derived(matrixState.timelines[roomId] ?? []);
  const queued = $derived(new Set(matrixState.outbox.map((o) => o.txnId)));
  const selfId = $derived(matrixState.userId);
  /** Issue #113: the announcements room is read-only for everyone below moderator. */
  const mayPost = $derived(!room || !selfId || canPost(room, selfId));
  /** Issue #111: the saved card behind a mesh DM peer, with its claimed Matrix id. */
  const peerContact = $derived.by(() => {
    if (!room?.isDirect) return undefined;
    const peerId = room.memberIds.find((id) => id !== selfId);
    return peerId ? contactForMeshUser(contactsState.contacts, peerId) : undefined;
  });

  let draft = $state('');
  let sending = $state(false);
  /** Filter over the locally cached timeline; no server search on the mesh. */
  let search = $state('');
  /** Event being replied to, shown as a quote above the composer. */
  let replyTo = $state<string | null>(null);
  let showMembers = $state(false);

  /** Reactions are folded onto the message they annotate, not shown as rows. */
  const messages = $derived.by(() => {
    const rows = timeline.filter((e) => e.msgtype !== 'm.reaction');
    const term = search.trim().toLowerCase();
    return term ? rows.filter((e) => e.body.toLowerCase().includes(term)) : rows;
  });
  const reactions = $derived.by(() => {
    const map: Record<string, { key: string; count: number; mine: boolean }[]> = {};
    for (const event of timeline) {
      if (!event.reactsTo || !event.reactionKey) continue;
      const list = (map[event.reactsTo] ??= []);
      const existing = list.find((r) => r.key === event.reactionKey);
      if (existing) {
        existing.count += 1;
        existing.mine ||= event.sender === selfId;
      } else {
        list.push({ key: event.reactionKey, count: 1, mine: event.sender === selfId });
      }
    }
    return map;
  });
  const quoted = $derived(replyTo ? timeline.find((e) => e.eventId === replyTo) : null);
  /** Issue #114: compose the next message as a session question. */
  let asking = $state(false);
  let showQuestions = $state(true);
  const questions = $derived.by(() => {
    const rows = timeline
      .filter((e) => e.question && !e.redacted)
      .map((e) => {
        const rs = reactions[e.eventId] ?? [];
        const up = rs.find((r) => r.key === '👍');
        return {
          event: e,
          votes: up?.count ?? 0,
          mine: up?.mine ?? false,
          answered: rs.some((r) => r.key === '✅'),
        };
      });
    return rows.sort(
      (a, b) =>
        Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.event.ts - b.event.ts,
    );
  });
  const members = $derived(
    (room?.memberIds ?? []).map((id) => ({ id, name: room?.memberNames[id] ?? localpart(id) })),
  );

  const QUICK_REACTIONS = ['👍', '🎉', '❤️', '😀'];

  async function react(eventId: string, key: string) {
    try {
      await getMatrix().toggleReaction(roomId, eventId, key);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  let attaching = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  const typingUsers = $derived(matrixState.typing[roomId] ?? []);
  const typingLabel = $derived.by(() => {
    const names = typingUsers.map((id) => room?.memberNames[id] ?? localpart(id));
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names.length} people are typing…`;
  });
  const canEncrypt = $derived(!room?.encrypted || matrixState.encryptionReady);
  let typingTimer: ReturnType<typeof setTimeout> | null = null;

  function onInput() {
    if (!draft.trim()) return;
    void getMatrix().setTyping(roomId, true);
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => void getMatrix().setTyping(roomId, false), 6000);
  }

  async function attach(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      error = 'Files larger than 20 MB are not sent from the companion.';
      return;
    }
    attaching = true;
    error = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await getMatrix().sendFile(roomId, bytes, file.name, file.type || 'application/octet-stream');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      attaching = false;
    }
  }
  let loadingOlder = $state(false);
  let error = $state<string | null>(null);
  let list = $state<HTMLElement | null>(null);

  onMount(async () => {
    void hydrateContacts();
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
      if (typingTimer) clearTimeout(typingTimer);
      void getMatrix().setTyping(roomId, false);
      await getMatrix().sendMessage(roomId, text, replyTo ?? undefined, { question: asking });
      asking = false;
      replyTo = null;
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
      {#if peerContact?.matrixId}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- external matrix.to permalink -->
        <a
          href={matrixToUrl(peerContact.matrixId)}
          rel="noreferrer"
          title="Their Matrix account, from the card they showed you · {meshLinkLabel(
            peerContact.meshLink,
          )}"
        >
          Continue on Matrix · {meshLinkLabel(peerContact.meshLink)}
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/if}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href={matrixToUrl(room.alias ?? room.roomId)} rel="noreferrer">Open in Element</a>
      <button class="button ghost small danger" onclick={leave}>Leave</button>
    </div>
  </header>

  {#if room.encrypted}
    <p class="notice" class:ok={canEncrypt} role="note">
      {#if canEncrypt}
        🔒 End-to-end encrypted with Megolm. Messages and files are encrypted on this device;
        senders are shown as unverified until you verify them in a full Matrix client.
      {:else if matrixState.serverCarriesEncryption === false}
        🔒 This room is marked encrypted, but this server cannot carry encryption keys, so nothing
        can be encrypted or decrypted here. Nothing you type will send.
      {:else}
        🔒 This room is end-to-end encrypted, but encryption could not start in this browser. Open
        the room in a full Matrix client to read and send.
      {/if}
    </p>
  {/if}

  <p class="statusline" aria-live="polite">
    <span class="dot {matrixState.status}"></span>
    {statusLabel(matrixState.status)}
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="roomtools">
    <button class="act" aria-expanded={showMembers} onclick={() => (showMembers = !showMembers)}>
      {members.length} in this room
    </button>
    <input
      class="search"
      type="search"
      bind:value={search}
      aria-label="Search messages in this room"
      placeholder="Search messages…"
    />
  </div>
  {#if showMembers}
    <ul class="members" aria-label="Room members">
      {#each members as member (member.id)}
        <li><strong>{member.name}</strong> <code>{member.id}</code></li>
      {/each}
    </ul>
  {/if}

  {#if questions.length > 0}
    <section class="questions" aria-label="Questions">
      <button
        class="qhead"
        onclick={() => (showQuestions = !showQuestions)}
        aria-expanded={showQuestions}
      >
        <strong>Questions</strong>
        <span class="muted small">{questions.length} · most wanted first</span>
      </button>
      {#if showQuestions}
        <ol>
          {#each questions as q (q.event.eventId)}
            <li class:answered={q.answered}>
              <button
                class="vote"
                class:mine={q.mine}
                aria-pressed={q.mine}
                aria-label="Upvote, {q.votes} so far"
                onclick={() => react(q.event.eventId, '👍')}>▲ {q.votes}</button
              >
              <span class="qtext">
                {q.event.body}
                <span class="muted small">
                  · {senderName(q.event.sender)}{q.answered ? ' · answered' : ''}
                </span>
              </span>
              {#if mayPost}
                <button
                  class="act"
                  title={q.answered ? 'Unmark as answered' : 'Mark as answered'}
                  aria-label={q.answered ? 'Unmark as answered' : 'Mark as answered'}
                  onclick={() => react(q.event.eventId, '✅')}>✅</button
                >
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  {/if}

  <section class="timeline" bind:this={list} aria-label="Messages">
    {#if room.prevBatch}
      <button class="older" onclick={loadOlder} disabled={loadingOlder}>
        {loadingOlder ? 'Loading…' : 'Load older messages'}
      </button>
    {/if}
    {#if messages.length === 0}
      <p class="muted small center">
        {search.trim() ? `No message matches “${search.trim()}”.` : 'No messages yet.'}
      </p>
    {/if}
    {#each messages as event (event.eventId)}
      {@const mine = event.sender === selfId}
      {@const pending = event.txnId ? queued.has(event.txnId) : false}
      <article
        class="msg"
        class:mine
        class:pending
        class:notice={event.msgtype === 'm.notice' ||
          event.msgtype === 'm.encrypted' ||
          event.redacted}
      >
        {#if !mine}<span class="sender">{senderName(event.sender)}</span>{/if}
        {#if event.question}<span class="qtag">Question</span>{/if}
        {#if event.replyTo}
          {@const target = timeline.find((e) => e.eventId === event.replyTo)}
          <p class="quote">
            <span class="quotewho">{target ? senderName(target.sender) : 'Earlier message'}</span>
            {target ? target.body : '…'}
          </p>
        {/if}
        {#if event.mediaUrl}
          <MediaAttachment {event} />
        {:else}
          <p class="body" class:undecryptable={event.undecryptable}>
            {event.msgtype === 'm.emote'
              ? `* ${senderName(event.sender)} ${event.body}`
              : event.body}
          </p>
        {/if}
        {#if reactions[event.eventId]}
          <div class="reactions">
            {#each reactions[event.eventId]! as r (r.key)}
              <button
                class="reaction"
                class:mine={r.mine}
                aria-pressed={r.mine}
                aria-label="{r.key} {r.count}"
                onclick={() => react(event.eventId, r.key)}>{r.key} {r.count}</button
              >
            {/each}
          </div>
        {/if}
        <span class="meta"
          >{event.encrypted ? '🔒 ' : ''}{pending ? 'Sending…' : timeOf(event.ts)}</span
        >
        {#if !pending}
          <div class="actions" aria-label="Message actions">
            <button class="act" onclick={() => (replyTo = event.eventId)}>Reply</button>
            {#each QUICK_REACTIONS as key (key)}
              <button class="act" aria-label="React {key}" onclick={() => react(event.eventId, key)}
                >{key}</button
              >
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </section>

  <p class="typing" aria-live="polite">{typingLabel}</p>
  {#if quoted}
    <p class="replying">
      Replying to <strong>{senderName(quoted.sender)}</strong>: {quoted.body.slice(0, 60)}
      <button class="act" onclick={() => (replyTo = null)} aria-label="Cancel reply">×</button>
    </p>
  {/if}
  {#if mayPost}
    <form class="composer" onsubmit={send}>
      <input
        type="file"
        class="hidden-input"
        bind:this={fileInput}
        onchange={attach}
        accept="image/*,application/pdf,.txt,.md,.zip"
        aria-label="Attach a file"
      />
      <button
        class="button secondary attach"
        class:asking
        type="button"
        aria-pressed={asking}
        aria-label={asking ? 'Sending as a question' : 'Ask a question'}
        title={asking ? 'Sending as a question' : 'Ask a question'}
        disabled={!canEncrypt || room.membership !== 'join'}
        onclick={() => (asking = !asking)}>❓</button
      >
      <button
        class="button secondary attach"
        type="button"
        aria-label="Attach a file or photo"
        disabled={attaching || !canEncrypt || matrixState.status !== 'online'}
        onclick={() => fileInput?.click()}>{attaching ? '…' : '📎'}</button
      >
      <input
        aria-label="Message"
        bind:value={draft}
        oninput={onInput}
        placeholder={!canEncrypt
          ? 'Encryption unavailable — open in Element to send'
          : asking
            ? 'Your question…'
            : 'Message…'}
        disabled={!canEncrypt || room.membership !== 'join'}
        autocomplete="off"
        enterkeyhint="send"
      />
      <button
        class="button primary"
        type="submit"
        disabled={sending || !canEncrypt || !draft.trim()}>Send</button
      >
    </form>
  {:else}
    <p class="muted small readonly" role="note">
      Only the organisers post in this room; you can read along.
    </p>
  {/if}
  {#if matrixState.status !== 'online'}
    <p class="muted small">You're offline: messages are queued and delivered when you reconnect.</p>
  {/if}
{/if}

<style>
  .quote {
    margin: 0 0 0.3rem;
    padding: 0.25rem 0.5rem;
    border-left: 3px solid var(--line-strong);
    background: color-mix(in srgb, var(--text-muted) 10%, transparent);
    border-radius: 4px;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .quotewho {
    display: block;
    font-weight: 700;
  }
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.3rem;
  }
  .reaction {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .reaction.mine {
    border-color: var(--mint);
    background: var(--mint-soft);
    color: var(--mint-ink);
  }
  .actions {
    display: flex;
    gap: 0.15rem;
    margin-top: 0.2rem;
    opacity: 0.75;
  }
  .act {
    min-height: 32px;
    padding: 0.1rem 0.4rem;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 0.78rem;
    cursor: pointer;
  }
  .act:hover {
    color: var(--text);
  }
  .replying {
    margin: 0 0 0.3rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .roomtools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.2rem 0;
  }
  .search {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.85rem;
  }
  .members {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    font-size: 0.82rem;
  }
  .members code {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
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
  .notice.ok {
    background: var(--mint-soft);
    border-color: color-mix(in srgb, var(--mint) 50%, transparent);
    color: var(--mint-ink);
  }
  .typing {
    min-height: 1.1rem;
    margin: 0.3rem 0 0;
    font-size: 0.78rem;
    color: var(--text-muted);
    font-style: italic;
  }
  .hidden-input {
    display: none;
  }
  .attach {
    min-width: 44px;
    padding: 0.4rem 0.6rem;
  }
  .body.undecryptable {
    font-style: italic;
    color: var(--text-muted);
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
  .questions {
    margin: 0 0 0.6rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 0.6rem;
    background: var(--surface, transparent);
  }
  .qhead {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    width: 100%;
    background: none;
    border: 0;
    padding: 0.2rem 0;
    text-align: left;
    cursor: pointer;
  }
  .questions ol {
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
  }
  .questions li {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    padding: 0.3rem 0;
    border-top: 1px solid var(--line);
  }
  .questions li.answered {
    opacity: 0.6;
  }
  .vote {
    flex: 0 0 auto;
    min-width: 3rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: none;
    padding: 0.15rem 0.5rem;
    cursor: pointer;
  }
  .vote.mine {
    background: var(--accent-soft, rgba(0, 0, 0, 0.08));
    border-color: var(--accent, currentColor);
  }
  .qtext {
    flex: 1 1 auto;
  }
  .qtag {
    display: inline-block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0 0.35rem;
    border-radius: 0.3rem;
    border: 1px solid var(--line);
    margin-bottom: 0.15rem;
  }
  .attach.asking {
    outline: 2px solid var(--accent, currentColor);
  }
</style>
