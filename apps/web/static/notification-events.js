/* Notification destinations must stay inside this Companion deployment. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = new URL(self.registration.scope);
  let target = new URL('plan', scope);
  try {
    const value = event.notification.data?.url;
    if (typeof value === 'string') {
      const candidate = new URL(value, scope);
      if (candidate.origin === scope.origin && candidate.pathname.startsWith(scope.pathname)) {
        target = candidate;
      }
    }
  } catch {
    // Invalid destinations open the plan, never an external page.
  }
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        const current = new URL(client.url);
        if (current.origin !== scope.origin || !current.pathname.startsWith(scope.pathname))
          continue;
        const navigated = await client.navigate(target.href);
        if (navigated) {
          await navigated.focus();
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
