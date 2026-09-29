const notificationText = (kind) => {
  if (kind === "mission_added") {
    return {
      title: "New Mission",
      body: "A new Mission is ready in the Edison program.",
    };
  }
  if (kind === "points_approved") {
    return {
      title: "Points approved",
      body: "Your points request was approved.",
    };
  }
  return null;
};

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const text = notificationText(payload.kind);
  if (!text || typeof payload.id !== "string") return;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const visibleClient = clients.find((client) => client.visibilityState === "visible");
    if (visibleClient) {
      visibleClient.postMessage({ type: "ras-notification", id: payload.id });
      return;
    }
    await self.registration.showNotification(text.title, {
      body: text.body,
      tag: `ras-${payload.id}`,
      data: { url: self.registration.scope },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of clients) {
      if ("focus" in client) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(destination);
  })());
});