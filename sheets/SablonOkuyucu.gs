/**
 * Mentor Map · Program şablonu okuyucu (kurum şablonuna bağlı Apps Script).
 *
 * Kurulum (yönetici, bir kez): Uzantılar → Apps Script → bu kodu yapıştırın → Kaydet. Sayfayı yenileyin;
 * Mentor Map menüsü → Bağlantıyı kur → yöneticinin uygulamada (Profil → Program şablonu) ürettiği anahtarı girin.
 *
 * Kullanım: Mentor Map → Önizle (hiçbir şey yazmaz, nelerin değişeceğini gösterir) → Gönder.
 * Gönder ve "Durumu yenile", uygulamada tutulan bilgileri (iptal, toplantı/materyal linki) "Mentor Map durumu"
 * sütununa, uygulamadan eklenen oturumları sekmenin altındaki "Eklenen seanslar (Mentor Map)" bölümüne salt okunur yazar.
 * Her bootcamp sekmesindeki her oturum grubunun kalıcı kimliği gizli T, U, V sütunlarında; Genel'de I sütununda.
 * Her bootcamp sekmesinin üstünde dönemin Zoom linki (B5) ve materyal linki (B6) durur; yeni dönemde yenisi yazılır.
 * Gönderen kişi Google hesabından tanınır: yönetici her sekmeyi, PO yalnızca kendi bootcamp'ini gönderebilir.
 */

const ADRES = 'https://SUPABASE_PROJE_REF.supabase.co/functions/v1/sablon-senkron';
const BETIK_SURUMU = 3;
const ILK_SATIR = 10;                                  // bootcamp sekmelerinde ilk hafta satırı
const GRUPLAR = [['A', 4], ['B', 9], ['C', 14]];        // grup harfi, Tarih sütunu (D, I, N); ardından Saat, Tür, Konu, Eğitmen(ler)
const ID_SUTUN = { A: 20, B: 21, C: 22 };               // T, U, V
const GENEL = { ad: 'Genel', baslik: 5, ilk: 6, id: 9 }; // No, Tarih, Saat, Başlık, Açıklama, Konuşmacı(lar), Dış konuşmacı, Not | I: ID
const ATLA = ['Nasıl doldurulur', 'Eğitmenler'];
const DURUM_SUTUN = { bootcamp: 23, genel: 10 };          // W; Genel'de J
const EK_ISARET = 'Eklenen seanslar (Mentor Map)';         // A sütununda; okuyucu bu satırdan sonrasını okumaz
const EK_ISARET_ESKI = ['Ek oturumlar (Mentor Map)'];      // önceki betiğin yazdığı ad da tanınır

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Mentor Map')
    .addItem('Önizle (hiçbir şey yazmaz)', 'onizle')
    .addItem('Gönder', 'gonderMenu')
    .addItem('Durumu yenile (programı değiştirmez)', 'durumuYenile')
    .addSeparator()
    .addItem('Sekme korumalarını kur (yönetici)', 'korumalariKur')
    .addItem('Bağlantıyı kur', 'baglantiKur')
    .addToUi();
}

function baglantiKur() {
  const ui = SpreadsheetApp.getUi();
  const y = ui.prompt('Mentor Map bağlantısı', 'Yöneticinin uygulamada ürettiği şablon anahtarını yapıştırın:', ui.ButtonSet.OK_CANCEL);
  if (y.getSelectedButton() !== ui.Button.OK) return;
  const a = y.getResponseText().trim();
  if (!/^[0-9a-f]{64}$/.test(a)) { ui.alert('Anahtar 64 karakter olmalı (0-9, a-f).'); return; }
  PropertiesService.getDocumentProperties().setProperty('ANAHTAR', a);
  ui.alert('Bağlantı kuruldu. Mentor Map → Önizle ile deneyin.');
}

// ---------------------------------------------------------------- okuma

function tarihMetni(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Istanbul', 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (s ? 'hatalı:' + s : '');
}

/** "20:30–23:00" -> ['20:30', '23:00']; bozuksa null. 24:00 gece yarısıdır. */
function saatAraligi(s) {
  const m = String(s || '').match(/^\s*(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})\s*$/);
  if (!m) return null;
  const iki = function (x) { return ('0' + x).slice(-2); };
  const bit = m[3] === '24' ? '00' : iki(m[3]);
  return [iki(m[1]) + ':' + m[2], bit + ':' + m[4]];
}

function adlar(s) {
  return String(s || '').split(/[,;]/).map(function (x) { return x.trim(); }).filter(String);
}

function bootcampSekmesiMi(sh) {
  return ATLA.indexOf(sh.getName()) < 0 && sh.getName().charAt(0) !== '_' &&
    String(sh.getRange('A2').getDisplayValue()).trim() === 'Kod';
}

// Ek oturumlar bölümünün başladığı satır (yoksa son satır + 1); program verisi bunun üstündedir.
function veriSonu(sh, ilk) {
  const son = sh.getLastRow();
  if (son < ilk) return son;
  const a = sh.getRange(ilk, 1, son - ilk + 1, 1).getDisplayValues();
  for (let i = 0; i < a.length; i++) {
    const v = String(a[i][0]).trim();
    if (v === EK_ISARET || EK_ISARET_ESKI.indexOf(v) >= 0) return ilk + i - 1;
  }
  return son;
}

function idSutunlariniHazirla(sh, ilkId, son, basliklar, basSatir) {
  if (sh.getMaxColumns() < son) sh.insertColumnsAfter(sh.getMaxColumns(), son - sh.getMaxColumns());
  sh.getRange(basSatir, ilkId, 1, basliklar.length).setValues([basliklar]);
  sh.hideColumns(ilkId, son - ilkId + 1);
}

/**
 * Tüm sekmeleri okur; kimliği olmayan ya da kopyalanmış (aynı kimlik iki kez) oturuma yeni kimlik yazar.
 * Döner: { sekmeler: [...], hucre: { kimlik: [sayfa, satır, sütun] } }
 */
function oku() {
  const ss = SpreadsheetApp.getActive();
  const sekmeler = [], hucre = {}, gorulen = {};
  ss.getSheets().forEach(function (sh) {
    if (sh.getName() === GENEL.ad) { sekmeler.push(genelOku(sh, hucre, gorulen)); return; }
    if (!bootcampSekmesiMi(sh)) return;
    idSutunlariniHazirla(sh, ID_SUTUN.A, ID_SUTUN.C, ['ID A', 'ID B', 'ID C'], ILK_SATIR - 1);
    const son = veriSonu(sh, ILK_SATIR);
    const gor = sh.getRange(1, 1, Math.max(son, ILK_SATIR), ID_SUTUN.C).getDisplayValues();
    const ham = sh.getRange(1, 1, Math.max(son, ILK_SATIR), ID_SUTUN.C).getValues();
    const varsayilan = saatAraligi(gor[3][1]) || ['20:30', '23:00'];
    const oturumlar = [];
    let yazildi = false;
    for (let i = ILK_SATIR - 1; i < son; i++) {
      const satir = gor[i];
      GRUPLAR.forEach(function (g) {
        const harf = g[0], c = g[1] - 1;
        const tarih = tarihMetni(ham[i][c]);
        if (!tarih) return;
        const grupTuru = String(gor[6][c] || '').trim(), grupAdi = String(gor[7][c] || '').trim();
        if (!grupTuru && !grupAdi) return;  // kullanılmayan grup
        const saat = saatAraligi(satir[c + 1]) || varsayilan;
        let id = String(ham[i][ID_SUTUN[harf] - 1] || '').trim();
        if (!/^[0-9a-f-]{36}$/.test(id) || gorulen[id]) {
          id = Utilities.getUuid();
          sh.getRange(i + 1, ID_SUTUN[harf]).setValue(id);
          yazildi = true;
        }
        gorulen[id] = true;
        hucre[id] = [sh.getName(), i + 1, ID_SUTUN[harf]];
        oturumlar.push({
          id: id, satir: i + 1, grup: harf, hafta: String(satir[0]).trim(), modul: satir[1],
          tarih: tarih, baslangic: saat[0], bitis: saat[1],
          tur: String(satir[c + 2] || '').trim() || grupTuru || 'Ders',
          konu: String(satir[c + 3] || '').trim() || String(satir[2] || '').trim(),
          egitmenler: adlar(satir[c + 4]), konuklar: []
        });
      });
    }
    if (yazildi) SpreadsheetApp.flush();
    const sekme = { sekme: sh.getName(), kod: String(gor[1][1]).trim(), donem: String(gor[2][1]).trim(), oturumlar: oturumlar };
    // Dönemin linkleri: üst bilgide "Zoom linki" ve "Materyal linki" satırları (B5, B6). Satır yoksa gönderilmez.
    for (let i = 3; i < ILK_SATIR - 2; i++) {
      const etiket = String(gor[i][0]).trim().toLocaleLowerCase('tr');
      if (etiket.indexOf('zoom') >= 0) sekme.zoom = String(gor[i][1]).trim();
      else if (etiket.indexOf('materyal') >= 0) sekme.materyal = String(gor[i][1]).trim();
    }
    sekmeler.push(sekme);
  });
  return { sekmeler: sekmeler, hucre: hucre };
}

function genelOku(sh, hucre, gorulen) {
  idSutunlariniHazirla(sh, GENEL.id, GENEL.id, ['ID'], GENEL.baslik);
  const son = veriSonu(sh, GENEL.ilk);
  const oturumlar = [];
  if (son >= GENEL.ilk) {
    const n = son - GENEL.ilk + 1;
    const gor = sh.getRange(GENEL.ilk, 1, n, GENEL.id).getDisplayValues();
    const ham = sh.getRange(GENEL.ilk, 1, n, GENEL.id).getValues();
    const varsayilan = saatAraligi(sh.getRange('B3').getDisplayValue()) || ['20:30', '23:00'];
    for (let i = 0; i < n; i++) {
      const tarih = tarihMetni(ham[i][1]);
      if (!tarih) continue;
      let id = String(ham[i][GENEL.id - 1] || '').trim();
      if (!/^[0-9a-f-]{36}$/.test(id) || gorulen[id]) {
        id = Utilities.getUuid();
        sh.getRange(GENEL.ilk + i, GENEL.id).setValue(id);
      }
      gorulen[id] = true;
      hucre[id] = [sh.getName(), GENEL.ilk + i, GENEL.id];
      const saat = saatAraligi(gor[i][2]) || varsayilan;
      oturumlar.push({
        id: id, satir: GENEL.ilk + i, grup: 'E', hafta: String(gor[i][0]).trim(), tarih: tarih,
        baslangic: saat[0], bitis: saat[1], tur: 'Etkinlik', konu: String(gor[i][3]).trim(),
        aciklama: String(gor[i][4]).trim(), egitmenler: adlar(gor[i][5]), konuklar: adlar(gor[i][6])
      });
    }
  }
  return { sekme: sh.getName(), kod: 'Genel', genel: true, oturumlar: oturumlar };
}

// ---------------------------------------------------------------- gönderim

function istek(yontem, govde) {
  const anahtar = PropertiesService.getDocumentProperties().getProperty('ANAHTAR');
  if (!anahtar) throw new Error('Bağlantı kurulmamış: Mentor Map → Bağlantıyı kur.');
  const y = UrlFetchApp.fetch(ADRES + (yontem === 'get' ? '?korumalar=1' : ''), {
    method: yontem, contentType: 'application/json', payload: govde ? JSON.stringify(govde) : undefined,
    headers: { 'X-Mentormap-Anahtar': anahtar, 'X-Mentormap-Tablo': SpreadsheetApp.getActive().getId() },
    muteHttpExceptions: true
  });
  let veri = {};
  try { veri = JSON.parse(y.getContentText()); } catch (e) { veri = { hata: y.getContentText().slice(0, 300) }; }
  return { kod: y.getResponseCode(), veri: veri };
}

function onizle() { gonder(true, false, false); }
function gonderMenu() { gonder(false, false, true); }
function durumuYenile() { gonder(true, false, true); }

// onizleme: veritabanına yazılmaz. durumYaz: dönen durum ve ek oturumlar sekmelere yazılır.
function gonder(onizleme, onay, durumYaz) {
  const ui = SpreadsheetApp.getUi();
  const okunan = oku();
  const y = istek('post', {
    betik_surumu: BETIK_SURUMU, onizleme: onizleme, onay: onay,
    gonderen: Session.getActiveUser().getEmail(), kaynak: SpreadsheetApp.getActive().getName(),
    sekmeler: okunan.sekmeler
  });
  if (y.kod === 409 && y.veri.onay_gerekli) {
    const cevap = ui.alert('Onay gerekiyor', y.veri.hata + '\n\nYine de devam edilsin mi?', ui.ButtonSet.YES_NO);
    if (cevap === ui.Button.YES) gonder(onizleme, true, durumYaz);
    return;
  }
  if (y.kod !== 200) { ui.alert('Mentor Map', 'Gönderilemedi: ' + (y.veri.hata || y.kod), ui.ButtonSet.OK); return; }
  const s = y.veri.sonuc;
  if (!onizleme) {
    // devralınan oturumlar: şablondaki kimlik Mentor Map'teki oturumun kimliğiyle değiştirilir
    (s.kimlik_degisimleri || []).forEach(function (k) {
      const h = okunan.hucre[k.eski];
      if (h) SpreadsheetApp.getActive().getSheetByName(h[0]).getRange(h[1], h[2]).setValue(k.yeni);
    });
  }
  if (durumYaz) durumlariYaz(okunan, s);
  if (durumYaz && onizleme) {
    ui.alert('Durum yenilendi', (s.durumlar || []).length + ' oturumun durumu ve ' +
      (s.ek_oturumlar || []).reduce(function (t, e) { return t + e.oturumlar.length; }, 0) +
      ' eklenen seans yazıldı. Program Mentor Map\'e gönderilmedi.', ui.ButtonSet.OK);
    return;
  }
  ui.alert(onizleme ? 'Önizleme (hiçbir şey yazılmadı)' : 'Gönderildi', ozetMetni(s), ui.ButtonSet.OK);
}

// ---------------------------------------------------------------- durum geri yazımı (MM-54)

function durumMetni(d) {
  const p = [];
  if (d.iptal) p.push('İPTAL' + (d.gerekce ? ': ' + d.gerekce : ''));
  if (d.link) p.push('Toplantı: ' + d.link);
  if (d.materyal) p.push('Materyal: ' + d.materyal);
  return p.join(' · ');
}

function durumlariYaz(okunan, s) {
  const ss = SpreadsheetApp.getActive();
  const satirlar = {};  // sayfa → satır → [metin]
  (s.durumlar || []).forEach(function (d) {
    const h = okunan.hucre[d.id];
    if (!h) return;
    const genel = h[0] === GENEL.ad, metin = durumMetni(d);
    if (!metin) return;
    const k = (satirlar[h[0]] = satirlar[h[0]] || {});
    (k[h[1]] = k[h[1]] || []).push(genel ? metin : d.grup + ': ' + metin);
  });
  const ekler = {};
  (s.ek_oturumlar || []).forEach(function (e) { ekler[e.sekme] = e.oturumlar; });
  okunan.sekmeler.forEach(function (x) {
    const sh = ss.getSheetByName(x.sekme);
    if (!sh) return;
    const genel = !!x.genel, sutun = genel ? DURUM_SUTUN.genel : DURUM_SUTUN.bootcamp;
    const ilk = genel ? GENEL.ilk : ILK_SATIR, baslik = ilk - 1;
    const son = veriSonu(sh, ilk);
    if (sh.getMaxColumns() < sutun) sh.insertColumnsAfter(sh.getMaxColumns(), sutun - sh.getMaxColumns());
    sh.showColumns(sutun);
    sh.getRange(baslik, sutun).setValue('Mentor Map durumu').setFontWeight('bold');
    if (son >= ilk) {
      const k = satirlar[x.sekme] || {}, degerler = [];
      for (let r = ilk; r <= son; r++) degerler.push([(k[r] || []).join('\n')]);
      sh.getRange(ilk, sutun, degerler.length, 1).setValues(degerler).setWrap(true).setFontColor('#b45309');
    }
    salt(sh, sh.getRange(baslik, sutun, Math.max(son, ilk) - baslik + 1, 1), 'durum');
    ekBolumuYaz(sh, son, genel ? GENEL.id - 1 : ID_SUTUN.C, ekler[x.sekme] || []);
  });
  SpreadsheetApp.flush();
}

// Uyarı korumalı alan: PO düzenlerse Sheets uyarır; bu alanı Mentor Map yazar.
function salt(sh, aralik, ad) {
  const aciklama = 'Mentor Map ' + ad + ' (otomatik; değiştirmeyin)';
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === aciklama) p.remove();
  });
  aralik.protect().setDescription(aciklama).setWarningOnly(true);
}

function ekBolumuYaz(sh, veriSon, genislik, oturumlar) {
  // yalnızca önceki Ek oturumlar bölümü silinir (şablonun boş, biçimli satırlarına dokunulmaz)
  const son = sh.getLastRow();
  if (son > veriSon) sh.getRange(veriSon + 1, 1, son - veriSon, Math.max(genislik, 7)).clearContent().setBackground(null);
  if (!oturumlar.length) return;
  const bas = veriSon + 3;
  const satirlar = [[EK_ISARET, '', '', '', '', '', ''],
    ['Tarih', 'Saat', 'Tür', 'Konu', 'Eğitmen(ler)', 'Durum', '']];
  oturumlar.forEach(function (o) {
    satirlar.push([o.tarih, o.saat, o.tur, o.konu || '', o.anlaticilar || '',
      o.iptal ? 'İPTAL' + (o.gerekce ? ': ' + o.gerekce : '') : '', '']);
  });
  const aralik = sh.getRange(bas, 1, satirlar.length, 7);
  aralik.setValues(satirlar).setBackground('#f3f4f6').setFontColor('#374151');
  sh.getRange(bas, 1).setFontWeight('bold');
  sh.getRange(bas + 1, 1, 1, 6).setFontWeight('bold');
  salt(sh, sh.getRange(veriSon + 1, 1, satirlar.length + 2, 7), 'eklenen seanslar');
}

function ozetMetni(s) {
  const satirlar = (s.sekmeler || []).map(function (x) {
    return x.sekme + (x.donem ? ' (' + x.donem + ')' : '') + ': ' + x.yeni + ' yeni, ' + x.guncellenen + ' güncellenen, ' +
      x.devralinan + ' devralınan, ' + x.kalkan + ' kalkan';
  });
  if (s.hata_sayisi) {
    satirlar.push('', s.hata_sayisi + ' sorun:');
    s.hatalar.slice(0, 15).forEach(function (h) {
      satirlar.push('• ' + h.sekme + (h.satir ? ' satır ' + h.satir : '') + (h.grup ? ' ' + h.grup : '') + ': ' + h.mesaj);
    });
  }
  if ((s.eslesmeyen_adlar || []).length) {
    satirlar.push('', 'Mentor Map\'te bulunamayan adlar (konuk olarak yazıldı): ' + s.eslesmeyen_adlar.join(', '));
  }
  satirlar.push('', 'Gönderen: ' + (s.gonderen || '?'));
  return satirlar.join('\n');
}

// ---------------------------------------------------------------- sekme korumaları (MM-52)

function korumalariKur() {
  const ui = SpreadsheetApp.getUi();
  const y = istek('get');
  if (y.kod !== 200) { ui.alert('Korumalar alınamadı: ' + (y.veri.hata || y.kod)); return; }
  const yoneticiler = y.veri.yoneticiler || [], po = y.veri.bootcamplar || {};
  const rapor = [];
  SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
    let kod = null;
    if (sh.getName() === GENEL.ad) kod = 'Genel';
    else if (bootcampSekmesiMi(sh)) kod = String(sh.getRange('B2').getDisplayValue()).trim();
    const duzenleyenler = yoneticiler.concat(kod ? (po[kod] || []) : []);
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
    const k = sh.protect().setDescription('Mentor Map: ' + (kod ? kod + ' PO\'ları ve yönetici' : 'yalnızca yönetici'));
    k.getEditors().forEach(function (e) {
      if (duzenleyenler.indexOf(e.getEmail()) < 0) { try { k.removeEditor(e); } catch (hata) { /* dosya sahibi çıkarılamaz */ } }
    });
    if (duzenleyenler.length) k.addEditors(duzenleyenler);
    rapor.push(sh.getName() + ': ' + (duzenleyenler.length ? duzenleyenler.join(', ') : 'yalnızca dosya sahibi'));
  });
  ui.alert('Sekme korumaları kuruldu', rapor.join('\n') + '\n\nE-postası yer tutucu olan PO\'lar eklenmedi.', ui.ButtonSet.OK);
}
