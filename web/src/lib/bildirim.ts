// Anlık bildirim (Web Push) aboneliği. iPhone'da yalnızca ana ekrana eklenmiş uygulamada çalışır (iOS 16.4+).

export const VAPID_ACIK = "BA3y1BqNrpOHzHxbWe0-EdEGp-L3x2qHR1WkV-1FEnaa3TQNhIAv6V1mAwKU3IMU4bOQKLLhbB4ydXb10bizuzk";

export type BildirimDurumu = "desteklenmiyor" | "ios-ana-ekran" | "reddedildi" | "kapali" | "acik";

export function iosMu(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function anaEkrandaMi(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function anahtar(b64: string): Uint8Array {
  const p = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function bildirimDurumu(): Promise<BildirimDurumu> {
  if (iosMu() && !anaEkrandaMi()) return "ios-ana-ekran";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "desteklenmiyor";
  if (Notification.permission === "denied") return "reddedildi";
  const kayit = await navigator.serviceWorker.getRegistration();
  const abonelik = await kayit?.pushManager.getSubscription();
  return abonelik && Notification.permission === "granted" ? "acik" : "kapali";
}

/** İzin ister ve bu cihazı kaydeder. Döner: sunucuya gönderilecek abonelik. */
export async function bildirimleriAc(): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const izin = await Notification.requestPermission();
  if (izin !== "granted") throw new Error("Bildirim izni verilmedi.");
  const kayit = await navigator.serviceWorker.ready;
  const abonelik = (await kayit.pushManager.getSubscription())
    ?? (await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtar(VAPID_ACIK) }));
  const j = abonelik.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("Cihaz kaydı alınamadı.");
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
}

/** Bu cihazın aboneliğini kaldırır. Döner: sunucudan silinecek endpoint. */
export async function bildirimleriKapat(): Promise<string | null> {
  const kayit = await navigator.serviceWorker.getRegistration();
  const abonelik = await kayit?.pushManager.getSubscription();
  if (!abonelik) return null;
  await abonelik.unsubscribe();
  return abonelik.endpoint;
}
