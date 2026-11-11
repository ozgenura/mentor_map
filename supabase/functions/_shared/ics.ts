// iCalendar (.ics) üretici. Bağımlılık yok: Edge Function (Deno) ve testler (Node) aynı kodu kullanır.
//
// Kurallar (dokümandaki "Takvim aboneliği" bölümü):
// - UID = oturum id, SEQUENCE = surum: güncellemeler kopya üretmez, mevcut etkinliği değiştirir.
// - İptal edilen oturum STATUS:CANCELLED ile kalır, takvim uygulaması onu düşürür.
// - Saatler TZID=Europe/Istanbul ile yazılır; takvim uygulaması kişinin saatine çevirir.
// - Saatsiz oturum tüm gün etkinliğidir ve TRANSP:TRANSPARENT olur (meşgul göstermez).

export type IcsAnlatici = { ad: string; rol: string };

export type IcsOturum = {
  id: string;
  bootcamp_ad: string;
  kisa_kod: string;
  tarih: string; // YYYY-MM-DD (TR günü)
  baslangic: string | null; // ISO timestamptz
  bitis: string | null;
  tur: string;
  konu: string;
  aciklama?: string | null;
  toplanti_linki?: string | null;
  materyal_linki?: string | null;
  durum: "planli" | "iptal";
  iptal_gerekcesi?: string | null;
  surum: number;
  guncelleme: string; // ISO timestamptz
  anlaticilar: IcsAnlatici[];
};

const TZID = "Europe/Istanbul";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0300",
  "TZNAME:+03",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const trParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZID,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** ISO zaman -> TR yerel 'YYYYMMDDTHHMMSS'. */
export function trLocal(iso: string): string {
  const p = Object.fromEntries(trParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateValue(ymd: string, addDays = 0): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

const enc = new TextEncoder();

/** RFC 5545: 75 oktetten uzun satırları katla; çok baytlı karakteri bölme. */
export function fold(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // devam satırları baştaki boşlukla başlar
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function eventLines(o: IcsOturum): string[] {
  const iptal = o.durum === "iptal";
  const summary = `${iptal ? "İPTAL: " : ""}[${o.kisa_kod}] ${o.konu || o.tur}`;
  const desc: string[] = [`${o.bootcamp_ad} · ${o.tur}`];
  if (o.anlaticilar.length) desc.push(`Anlatıcı: ${o.anlaticilar.map((a) => a.ad).join(", ")}`);
  if (!o.baslangic) desc.push("Saat bilgisi belirsiz.");
  if (iptal && o.iptal_gerekcesi) desc.push(`İptal gerekçesi: ${o.iptal_gerekcesi}`);
  if (o.aciklama) desc.push("", o.aciklama);
  if (o.toplanti_linki) desc.push("", `Toplantı: ${o.toplanti_linki}`);
  if (o.materyal_linki) desc.push(`Materyal: ${o.materyal_linki}`);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${o.id}@mentormap`,
    `DTSTAMP:${utcStamp(o.guncelleme)}`,
    `SEQUENCE:${o.surum}`,
  ];
  if (o.baslangic && o.bitis) {
    lines.push(`DTSTART;TZID=${TZID}:${trLocal(o.baslangic)}`, `DTEND;TZID=${TZID}:${trLocal(o.bitis)}`);
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${dateValue(o.tarih)}`,
      `DTEND;VALUE=DATE:${dateValue(o.tarih, 1)}`,
      "TRANSP:TRANSPARENT",
    );
  }
  lines.push(`SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(desc.join("\n"))}`);
  const link = o.toplanti_linki && /^https?:\/\/[^\s<>"]+$/i.test(o.toplanti_linki) ? o.toplanti_linki : null;
  if (link) lines.push(`URL:${link}`, `LOCATION:${escapeText(link)}`);
  lines.push(`STATUS:${iptal ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  return lines;
}

export function buildCalendar(kisiAd: string, oturumlar: IcsOturum[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mentor Map//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`Mentor Map · ${kisiAd}`)}`,
    `X-WR-TIMEZONE:${TZID}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
    ...oturumlar.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
