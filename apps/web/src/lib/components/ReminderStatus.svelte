<script lang="ts">
  import { resolve } from '$app/paths';
  import { reminderState, testReminder } from '$lib/notifications.svelte';
</script>

<p class="muted">
  Browser reminders need this app open and active. They may stop when the app is closed, the screen
  locks, or the browser suspends it. For reminders outside the app,
  <a href={resolve('/plan')}>open your plan and add it to your calendar</a>.
</p>
<p role="status">
  {#if reminderState.status === 'requesting'}
    Waiting for notification permission…
  {:else if reminderState.status === 'granted'}
    Permission granted. Reminders are enabled while the app is open.
  {:else if reminderState.status === 'blocked'}
    Notifications are blocked. Allow them in your browser's site settings, then try again.
  {:else if reminderState.status === 'unsupported'}
    This browser does not support these reminders. Use your calendar instead.
  {:else if reminderState.status === 'dismissed'}
    Permission was not granted. Reminders are off; you can try again whenever you like.
  {:else if reminderState.status === 'error'}
    Reminders could not be enabled or saved. They are off. Please try again.
  {:else}
    Reminders are off.
  {/if}
</p>
{#if reminderState.status === 'granted'}
  <button class="button secondary" onclick={testReminder}>Send a test reminder</button>
{/if}
{#if reminderState.testMessage}<p role="status">{reminderState.testMessage}</p>{/if}
