<script lang="ts">
  import { resolve } from '$app/paths';
  import { reminderState, testReminder } from '$lib/notifications.svelte';

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
</script>

<p class="muted">
  Browser reminders fire while this app is open. With the screen locked or the app in the
  background, one that falls due is shown the moment you come back to the app, up to 20 minutes
  late. For reminders that ring on their own,
  <a href={resolve('/plan')}>add your plan to your calendar</a> or install the Android app.
</p>
{#if reminderState.status === 'unsupported' && isIOS}
  <p class="muted">
    On iPhone, Safari tabs cannot show notifications. Add the Companion to your Home Screen (Share,
    then "Add to Home Screen") and open it from there; reminders can be turned on in the installed
    app.
  </p>
{/if}
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
