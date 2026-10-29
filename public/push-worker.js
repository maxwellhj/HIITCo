/* Loaded by the PWA service worker. Notification content deliberately excludes messages and names. */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.showNotification("HIIT Co. Hub", {
        body: "You have a new message in Connect.",
        icon: "/hub-icon-192.png",
        badge: "/hub-icon-192.png",
        tag: "hiitco-connect",
        data: { url: "/#connect" },
      });
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        try {
          client.postMessage({ type: "HIITCO_MESSAGE_PUSH" });
        } catch {}
      }
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL("/#connect", self.location.origin).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows)
        if (new URL(client.url).origin === self.location.origin) {
          try {
            await client.navigate(url);
            await client.focus();
            return;
          } catch {}
        }
      await self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "HIITCO_PUSH_READY")
    event.ports[0]?.postMessage({ ready: true });
});
