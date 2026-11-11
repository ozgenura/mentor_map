// Saat gösterimi. Program her zaman TR saatine göre kurulur; TR dışındaki eğitmen ikinci saati görür.

export const TR = "Europe/Istanbul";

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, make: () => Intl.DateTimeFormat) {
  let f = cache.get(key);
  if (!f) cache.set(key, (f = make()));
  return f;
}

function parts(iso: string, tz: string) {
  const f = fmt(`p:${tz}`, () =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }),
  );
  return Object.fromEntries(f.formatToParts(new Date(iso)).map((p) => [p.type, p.value])) as Record<string, string>;
}

/** ISO -> 'HH:MM' verilen saat diliminde. */
export function saat(iso: string, tz: string = TR): string {
  const p = parts(iso, tz);
  return `${p.hour}:${p.minute}`;
}

/** ISO -> 'YYYY-MM-DD' verilen saat diliminde. */
export function gun(iso: string, tz: string = TR): string {
  const p = parts(iso, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** TR duvar saati (ofsetsiz ISO): FullCalendar'ın TR saatini olduğu gibi çizmesi için. */
export function trDuvar(iso: string): string {
  const p = parts(iso, TR);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

type Aralikli = { tarih: string; baslangic: string | null; bitis: string | null };

/** '20:30–24:00' (TR) ya da kişinin saat diliminde '18:30–22:00'. Saatsiz oturumda null. */
export function saatAraligi(o: Aralikli, tz: string = TR): string | null {
  if (!o.baslangic || !o.bitis) return null;
  let son = saat(o.bitis, tz);
  // TR'de gece yarısında biten ders '24:00' diye yazılır (Excel'deki gibi)
  if (tz === TR && son === "00:00" && gun(o.bitis, TR) > o.tarih) son = "24:00";
  return `${saat(o.baslangic, tz)}–${son}`;
}

/** Kişinin saat dilimi bu oturum anında TR'den farklı mı? */
export function farkliSaat(iso: string | null, tz: string): boolean {
  return !!iso && tz !== TR && saat(iso, tz) !== saat(iso, TR);
}

export function sehir(tz: string): string {
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ");
}

export function bugunTR(): string {
  return gun(new Date().toISOString(), TR);
}

export function gunEkle(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** '2026-10-20' -> 'Salı, 20 Ekim' (yıl farklıysa sonuna eklenir). */
export function gunBasligi(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const haftaGunu = fmt("wd", () => new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "UTC" })).format(d);
  const ayGun = fmt("dm", () => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" })).format(d);
  const yil = ymd.slice(0, 4) !== bugunTR().slice(0, 4) ? ` ${ymd.slice(0, 4)}` : "";
  return `${haftaGunu}, ${ayGun}${yil}`;
}

/** Pazartesi başlayan haftanın ilk günü. */
export function haftaBasi(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return gunEkle(ymd, -((d.getUTCDay() + 6) % 7));
}

export function sureSaat(o: Aralikli): number {
  if (!o.baslangic || !o.bitis) return 0;
  return (Date.parse(o.bitis) - Date.parse(o.baslangic)) / 36e5;
}

export function gorece(iso: string): string {
  const dk = Math.round((Date.now() - Date.parse(iso)) / 6e4);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dakika önce`;
  const sa = Math.round(dk / 60);
  if (sa < 24) return `${sa} saat önce`;
  return `${Math.round(sa / 24)} gün önce`;
}
