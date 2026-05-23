self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if any app window is currently focused
      const isFocused = clientList.some((client) => client.focused);
      if (isFocused) {
        return; // Suppress notification when app is in foreground/focused
      }

      const data = event.data ? event.data.json() : {};
      const title = data.title || 'Ex-Skill';
      const options = {
        body: data.body || 'New message received',
        icon: '/icon.svg',
        badge: '/icon.svg',
      };
      return self.registration.showNotification(title, options);
    })
  );
});
