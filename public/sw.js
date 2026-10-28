// LayLock service worker: shows pick alerts and opens the tracker when one is tapped.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "LayLock", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "LayLock", {
      body: data.body || "",
      icon: "/apple-icon.png",
      badge: "/apple-icon.png",
      tag: data.tag,
      data: { url: data.url || "/tracker" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/tracker", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then((w) => w && w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
