/** Both the test button and scheduled reminders use the mobile-capable delivery path. */
export async function showBrowserNotification(
  title: string,
  options: NotificationOptions,
  /** Absolute app URL, validated again by the service worker when clicked. */
  url: string,
  stillCurrent: () => boolean = () => true,
): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    throw new Error('Notification permission is not granted');
  }
  // Unlike ready, getRegistration settles when no worker is installed (e.g. dev/private mode).
  const registration =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration(url)
      : undefined;
  if (!stillCurrent()) return;
  if (registration?.active && typeof registration.showNotification === 'function') {
    await registration.showNotification(title, { ...options, data: { url } });
    return;
  }
  // Desktop fallback. Mobile constructor failure propagates to the test status.
  const shown = new Notification(title, options);
  shown.onclick = () => {
    window.focus();
    window.location.assign(url);
    shown.close();
  };
}
