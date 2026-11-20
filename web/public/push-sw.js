// Service worker'a eklenen anlık bildirim dinleyicileri (workbox importScripts).
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { govde: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.baslik || "Mentor Map", {
    body: d.govde || "", icon: "/pwa-192.png", badge: "/pwa-192.png", tag: d.etiket, lang: "tr",
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hedef = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((pencereler) => {
    for (const p of pencereler) {
      if (new URL(p.url).origin === self.location.origin && "focus" in p) {
        return p.navigate(hedef).then((x) => (x || p).focus());
      }
    }
    return self.clients.openWindow(hedef);
  }));
});
