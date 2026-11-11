/**
 * Mentor Map · Google Sheets senkronu
 *
 * Kurulum (dosyanın sahibi bir kez yapar):
 *  1. Uzantılar → Apps Script → bu dosyanın tamamını yapıştırın → Kaydet.
 *  2. Sayfayı yenileyin; menüde "Mentor Map" görünür.
 *  3. Mentor Map → Bağlantıyı kur → yöneticinin uygulamada (Profil → Google Sheets bağlantısı) ürettiği anahtarı yapıştırın.
 *     Google bir kez izin ister: e-tabloyu okumak/yazmak, harici adrese istek göndermek ve zamanlayıcı kurmak.
 *
 * Sonrası kendiliğinden: her düzenlemeden yaklaşık 1 dakika sonra tüm sayfa Mentor Map'e gönderilir.
 * Sonuç "Senkron" sekmesine yazılır; hatalı satırlar Oturumlar sekmesinde kırmızıya boyanır.
 */

// Kurulumda kendi Supabase projenizin adresiyle değiştirin (Project Settings → API → Project URL).
const ADRES = 'https://SUPABASE_PROJE_REF.supabase.co/functions/v1/sheets-senkron';
const SEKME = { OTURUM: 'Oturumlar', KISI: 'Kişiler', BOOTCAMP: "Bootcamp'ler", LOG: 'Senkron' };
const SUTUN_SAYISI = 10; // Oturumlar: A..J
const HATA_RENGI = '#FDE3E5';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Mentor Map')
    .addItem('Şimdi gönder', 'simdiGonder')
    .addItem('Büyük değişikliği onayla ve gönder', 'onayliGonder')
    .addSeparator()
    .addItem('Eğitmen seç (birden fazla)…', 'egitmenSec')
    .addSeparator()
    .addItem('Açılır listeleri kur', 'listeleriKurMenu')
    .addItem('Bağlantıyı kur', 'baglantiKur')
    .addItem('Bağlantıyı kaldır', 'baglantiKaldir')
    .addToUi();
}

function baglantiKur() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Mentor Map bağlantısı',
    'Yöneticinin uygulamada (Profil → Google Sheets bağlantısı) ürettiği anahtarı yapıştırın:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const anahtar = r.getResponseText().trim();
  if (!/^[0-9a-f]{64}$/.test(anahtar)) { ui.alert('Anahtar 64 karakterden oluşmalı. Uygulamadan yeniden kopyalayın.'); return; }
  PropertiesService.getScriptProperties().setProperty('ANAHTAR', anahtar);
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  const ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('degisti').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('degisti').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('zamanli').timeBased().everyMinutes(1).create();
  listeleriKur();
  ui.alert('Bağlantı kuruldu. İlk gönderim yapılıyor.\n\n' + gonder(false));
}

function baglantiKaldir() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  PropertiesService.getScriptProperties().deleteAllProperties();
  SpreadsheetApp.getUi().alert('Bağlantı kaldırıldı. Değişiklikler artık Mentor Map\'e gitmez.');
}

/**
 * Sekmeleri birbirine bağlayan açılır listeler. Aralıklar açık uçlu (A2:A): Kişiler ya da Bootcamp'ler
 * sekmesine satır eklendikçe listeler kendiliğinden genişler. Yanlış değer yazılırsa uyarı gösterilir;
 * kesin kontrolü Mentor Map yapar (hatalı satır kırmızı olur).
 */
function listeleriKur() {
  const ss = SpreadsheetApp.getActive();
  const ot = ss.getSheetByName(SEKME.OTURUM), ki = ss.getSheetByName(SEKME.KISI), bc = ss.getSheetByName(SEKME.BOOTCAMP);
  if (!ot || !ki || !bc) throw new Error('Oturumlar, Kişiler ve Bootcamp\'ler sekmeleri gerekli.');
  const kod = SpreadsheetApp.newDataValidation().requireValueInRange(bc.getRange('A2:A'), true).setAllowInvalid(false)
    .setHelpText("Bootcamp'ler sekmesindeki kodlardan birini seçin.").build();
  const kisi = SpreadsheetApp.newDataValidation().requireValueInRange(ki.getRange('A2:A'), true).setAllowInvalid(true)
    .setHelpText('Kişiler sekmesindeki adlardan birini seçin. Listede yoksa önce Kişiler sekmesine ekleyin.').build();
  const tur = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Kick-Off', 'Ders', 'Ek Ders', 'Uygulama', 'Mentor Görüşmesi', 'Office Hours', 'Master Class',
                         'Proje', 'Sunum', 'Etkinlik'], true)
    .setAllowInvalid(false).build();
  ot.getRange('B2:B').setDataValidation(kod);   // Bootcamp
  ot.getRange('F2:F').setDataValidation(tur);   // Tür
  ot.getRange('H2:H').setDataValidation(kisi);  // Ana eğitmen
  ot.getRange('I2:I').setDataValidation(kisi);  // Yardımcı eğitmen(ler): çoklu seçim için listeleriKurMenu notuna bakın
  const bootcampCoklu = SpreadsheetApp.newDataValidation().requireValueInRange(bc.getRange('A2:A'), true)
    .setAllowInvalid(true).build();
  ki.getRange('E2:E').setDataValidation(bootcampCoklu); // Ana eğitmen olduğu bootcamp'ler
  ki.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Eğitmen', 'Asistan', 'Yönetici'], true).setAllowInvalid(false).build());   // Rol
  ki.getRange('G2:G').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['İç', 'Dış'], true).setAllowInvalid(false).build());                        // Kurum
  bc.getRange('E2:F').setDataValidation(kisi);  // PO, Asistan(lar): Kişiler sekmesindeki adlar
}

function listeleriKurMenu() {
  listeleriKur();
  SpreadsheetApp.getUi().alert('Açılır listeler kuruldu.\n\nBirden fazla yardımcı eğitmen seçebilmek için bir kez: Oturumlar sekmesinde I sütununu seçin → Veri → Veri doğrulama → kurala tıklayın → "Birden çok seçime izin ver" kutusunu işaretleyin. Aynısını Kişiler sekmesinin E sütunu ve Bootcamp\'ler sekmesinin F sütunu (asistanlar) için yapın.');
}

/**
 * Seçili Oturumlar satırları için işaretlemeli eğitmen seçme penceresi. Ana eğitmen sütunu (H) seçiliyse tek kişi,
 * diğer durumlarda Yardımcı eğitmen(ler) sütununa (I) virgülle ayrılmış liste yazar. Birden fazla satır seçilebilir.
 */
function egitmenSec() {
  const ss = SpreadsheetApp.getActive();
  const sayfa = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  if (sayfa.getName() !== SEKME.OTURUM) { ui.alert('Önce Oturumlar sekmesinde bir ya da birkaç satır seçin.'); return; }
  const secim = sayfa.getActiveRange();
  const ilk = secim.getRow(), adet = secim.getNumRows();
  if (ilk < 2) { ui.alert('Başlık satırı yerine oturum satırlarını seçin.'); return; }
  const tek = secim.getColumn() === 8 && secim.getNumColumns() === 1;  // Ana eğitmen sütunu
  const sutun = tek ? 8 : 9;
  const kisiler = satirlar(ss.getSheetByName(SEKME.KISI), 6)
    .filter(function (x) { return x.d[0] && String(x.d[5]).toUpperCase() !== 'HAYIR'; })
    .map(function (x) { return x.d[0]; })
    .sort(function (a, b) { return a.localeCompare(b, 'tr'); });
  const mevcut = String(sayfa.getRange(ilk, sutun).getDisplayValue()).split(',')
    .map(function (x) { return x.trim(); }).filter(String);
  const t = HtmlService.createTemplate(
    '<style>body{font:14px Arial,sans-serif;margin:0}input[type=search]{width:100%;box-sizing:border-box;padding:8px;margin-bottom:8px}' +
    '#l{max-height:330px;overflow:auto}label{display:block;padding:5px 2px}.alt{margin-top:10px;display:flex;gap:8px;justify-content:flex-end}' +
    'button{padding:8px 14px}#k{background:#0B3B2C;color:#fff;border:0;border-radius:6px}</style>' +
    '<input type="search" id="a" placeholder="Ara…" autofocus><div id="l"></div>' +
    '<div class="alt"><button onclick="google.script.host.close()">Vazgeç</button><button id="k">Kaydet</button></div>' +
    '<script>const V=<?!= veri ?>;const l=document.getElementById("l");' +
    'V.kisiler.forEach(function(ad){const e=document.createElement("label");const c=document.createElement("input");' +
    'c.type=V.tek?"radio":"checkbox";c.name="k";c.value=ad;c.checked=V.mevcut.indexOf(ad)>=0;e.appendChild(c);' +
    'e.appendChild(document.createTextNode(" "+ad));l.appendChild(e);});' +
    'document.getElementById("a").oninput=function(){const q=this.value.toLocaleLowerCase("tr");' +
    'l.querySelectorAll("label").forEach(function(e){e.style.display=e.textContent.toLocaleLowerCase("tr").indexOf(q)>=0?"":"none";});};' +
    'document.getElementById("k").onclick=function(){const s=[].slice.call(l.querySelectorAll("input:checked")).map(function(c){return c.value;});' +
    'this.disabled=true;google.script.run.withSuccessHandler(function(){google.script.host.close();}).egitmenYaz(V.ilk,V.adet,V.sutun,s);};</script>');
  t.veri = JSON.stringify({ kisiler: kisiler, mevcut: mevcut, ilk: ilk, adet: adet, sutun: sutun, tek: tek })
    .replace(/</g, '\\u003c');
  ui.showModalDialog(t.evaluate().setWidth(360).setHeight(460),
    (tek ? 'Ana eğitmen' : 'Yardımcı eğitmen(ler)') + (adet > 1 ? ' · ' + adet + ' satır' : ''));
}

function egitmenYaz(ilk, adet, sutun, adlar) {
  if (sutun !== 8 && sutun !== 9) throw new Error('Geçersiz sütun');
  const sayfa = SpreadsheetApp.getActive().getSheetByName(SEKME.OTURUM);
  const deger = (adlar || []).map(function (x) { return String(x).trim(); }).filter(String).join(', ');
  const hedef = sayfa.getRange(ilk, sutun, adet, 1);
  hedef.setValues(Array.from({ length: adet }, function () { return [deger]; }));
  degisti(); // betikle yapılan değişiklik düzenleme tetikleyicisini çalıştırmaz: gönderim için işaretle
}

/** Düzenleme tetikleyicisi: yalnızca "değişti" işareti koyar; gönderimi zamanlayıcı yapar. */
function degisti() {
  PropertiesService.getScriptProperties().setProperty('KIRLI', String(Date.now()));
}

/** Dakikada bir: son düzenlemeden en az 20 saniye geçtiyse gönder (yazma sürerken yarım satır gitmesin). */
function zamanli() {
  const kirli = PropertiesService.getScriptProperties().getProperty('KIRLI');
  if (!kirli || Date.now() - Number(kirli) < 20000) return;
  gonder(false);
}

function simdiGonder() { SpreadsheetApp.getUi().alert(gonder(false)); }

function onayliGonder() {
  const ui = SpreadsheetApp.getUi();
  const c = ui.alert('Büyük değişiklik', 'Şablonda olmayan oturumlar Mentor Map\'te "şablondan kalktı" olarak işaretlenecek. Satırları bilerek sildiyseniz devam edin.', ui.ButtonSet.YES_NO);
  if (c === ui.Button.YES) ui.alert(gonder(true));
}

/** Tüm sayfayı okur, ID'siz satırlara ID verir, gönderir ve sonucu yazar. Kullanıcıya gösterilecek metni döner. */
function gonder(onay) {
  const kilit = LockService.getScriptLock();
  if (!kilit.tryLock(30000)) return 'Başka bir gönderim sürüyor; birazdan tekrar deneyin.';
  try {
    const props = PropertiesService.getScriptProperties();
    const anahtar = props.getProperty('ANAHTAR');
    if (!anahtar) return 'Bağlantı kurulmamış: Mentor Map → Bağlantıyı kur.';
    props.deleteProperty('KIRLI'); // gönderim sırasında yapılan düzenleme yeniden işaret koyar

    const ss = SpreadsheetApp.getActive();
    const veri = {
      kaynak: ss.getName(),
      onay: !!onay,
      bootcamplar: satirlar(ss.getSheetByName(SEKME.BOOTCAMP), 6).map(function (x) {
        return { satir: x.satir, kod: x.d[0], ad: x.d[1], renk: x.d[2], zoom: x.d[3], po: x.d[4], asistan: x.d[5] };
      }),
      kisiler: satirlar(ss.getSheetByName(SEKME.KISI), 7).map(function (x) {
        return { satir: x.satir, ad: x.d[0], eposta: x.d[1], rol: x.d[2], saat_dilimi: x.d[3], ana_egitmen: x.d[4],
                 aktif: String(x.d[5]).trim().toUpperCase() !== 'HAYIR', kurum: x.d[6] };
      }),
      oturumlar: oturumSatirlari(ss.getSheetByName(SEKME.OTURUM))
    };

    let kod, govde;
    try {
      const yanit = UrlFetchApp.fetch(ADRES, {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(veri),
        headers: { 'X-Mentormap-Anahtar': anahtar }, muteHttpExceptions: true
      });
      kod = yanit.getResponseCode();
      try { govde = JSON.parse(yanit.getContentText()); } catch (e) { govde = { hata: yanit.getContentText().slice(0, 300) }; }
    } catch (e) {
      kod = 0; govde = { hata: 'Mentor Map\'e ulaşılamadı: ' + e.message };
    }
    return sonucuYaz(ss, kod, govde);
  } finally {
    kilit.releaseLock();
  }
}

/** Başlık satırından sonraki dolu satırlar: [{satir, d: [...görünen değerler]}] */
function satirlar(sayfa, sutun) {
  if (!sayfa || sayfa.getLastRow() < 2) return [];
  const degerler = sayfa.getRange(2, 1, sayfa.getLastRow() - 1, sutun).getDisplayValues();
  const sonuc = [];
  degerler.forEach(function (d, i) {
    const temiz = d.map(function (v) { return String(v).trim(); });
    if (temiz.some(function (v) { return v !== ''; })) sonuc.push({ satir: i + 2, d: temiz });
  });
  return sonuc;
}

function oturumSatirlari(sayfa) {
  if (!sayfa || sayfa.getLastRow() < 2) return [];
  const n = sayfa.getLastRow() - 1;
  const idAraligi = sayfa.getRange(2, 1, n, 1);
  const idler = idAraligi.getValues();
  const degerler = sayfa.getRange(2, 1, n, SUTUN_SAYISI).getDisplayValues();
  const gorulen = {};
  let idDegisti = false;
  const sonuc = [];
  degerler.forEach(function (d, i) {
    const t = d.map(function (v) { return String(v).trim(); });
    if (!t.slice(1).some(function (v) { return v !== ''; })) return; // boş satır (yalnızca ID kalmış olabilir)
    let id = t[0];
    // Yeni satır ya da kopyalanıp çoğaltılmış satır: yeni ID
    if (!/^[0-9a-f-]{36}$/i.test(id) || gorulen[id]) {
      id = Utilities.getUuid();
      idler[i][0] = id;
      idDegisti = true;
    }
    gorulen[id] = true;
    sonuc.push({ satir: i + 2, id: id, bootcamp: t[1], tarih: tarih(t[2]), baslangic: t[3], bitis: t[4],
                 tur: t[5], konu: t[6], ana: t[7], yardimci: t[8], konuk: t[9] });
  });
  if (idDegisti) idAraligi.setValues(idler);
  return sonuc;
}

/** "12.11.2026" ya da "12/11/2026" girilmişse 2026-11-12'ye çevirir. */
function tarih(v) {
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  if (!m) return v;
  return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

/**
 * Kişiler sekmesinde bir ad değişince (ör. "Ata" -> tam adı) Oturumlar'daki Ana/Yardımcı hücrelerinde eski adı
 * yenisiyle değiştirir. Virgülle ayrılmış listelerde yalnızca tam eşleşen ad değişir. Değişen hücre sayısını döner.
 */
function adlariGuncelle(ss, liste) {
  if (!liste.length) return 0;
  const ot = ss.getSheetByName(SEKME.OTURUM);
  if (!ot || ot.getLastRow() < 2) return 0;
  const harita = {};
  liste.forEach(function (x) { harita[x.eski] = x.yeni; });
  const aralik = ot.getRange(2, 8, ot.getLastRow() - 1, 2); // H: Ana eğitmen, I: Yardımcı eğitmen(ler)
  const degerler = aralik.getValues();
  let sayi = 0;
  const yeni = degerler.map(function (satir) {
    return satir.map(function (hucre) {
      if (hucre === '' || hucre === null) return hucre;
      const parcalar = String(hucre).split(',').map(function (x) { return x.trim(); });
      const cevrilmis = parcalar.map(function (x) { return harita[x] || x; });
      if (cevrilmis.join('|') === parcalar.join('|')) return hucre;
      sayi++;
      return cevrilmis.join(', ');
    });
  });
  if (sayi) aralik.setValues(yeni);
  return sayi;
}

function sonucuYaz(ss, kod, govde) {
  const log = ss.getSheetByName(SEKME.LOG) || ss.insertSheet(SEKME.LOG);
  const simdi = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd HH:mm');
  let durum, ozetMetni = '', hatalar = [];
  if (kod === 200 && govde.tamam) {
    const o = govde.ozet;
    hatalar = o.hatalar || [];
    const degisen = adlariGuncelle(ss, o.yeniden_adlandirma || []);
    if (degisen) ozetMetni = degisen + ' hücrede eski eğitmen adı yenisiyle değiştirildi. ';
    durum = hatalar.length ? 'Gönderildi, ' + hatalar.length + ' satır atlandı' : 'Gönderildi';
    ozetMetni += o.yeni + ' yeni, ' + o.guncellenen + ' güncellenen, ' + o.kalkan + ' şablondan kalkan, ' +
                o.kisi + ' kişi ve ' + o.bootcamp + ' bootcamp değişikliği' +
                (o.pasif ? '; Kişiler sekmesinde olmayan ' + o.pasif + ' eğitmen pasife alındı' : '');
  } else if (kod === 409) {
    durum = 'Onay gerekiyor';
    ozetMetni = govde.hata + ' Menü: Mentor Map → Büyük değişikliği onayla ve gönder.';
  } else if (kod === 401) {
    durum = 'Anahtar geçersiz';
    ozetMetni = (govde.hata || '') + ' Menü: Mentor Map → Bağlantıyı kur.';
  } else {
    durum = 'Gönderilemedi';
    ozetMetni = govde.hata || ('Hata kodu ' + kod);
  }

  log.clear();
  log.getRange(1, 1, 3, 2).setValues([['Son deneme', simdi], ['Durum', durum], ['Özet', ozetMetni]]);
  log.getRange(1, 1, 3, 1).setFontWeight('bold');
  log.getRange(2, 2).setBackground(durum === 'Gönderildi' ? '#DDF2E8' : HATA_RENGI);
  if (hatalar.length) {
    log.getRange(5, 1, 1, 3).setValues([['Sekme', 'Satır', 'Sorun']]).setFontWeight('bold');
    log.getRange(6, 1, hatalar.length, 3).setValues(hatalar.map(function (h) { return [h.sekme, h.satir, h.mesaj]; }));
  }
  log.setColumnWidth(1, 120); log.setColumnWidth(2, 140); log.setColumnWidth(3, 520);

  // Oturumlar: önceki işaretleri temizle, hatalı satırları boya
  const ot = ss.getSheetByName(SEKME.OTURUM);
  if (ot && ot.getLastRow() > 1) {
    ot.getRange(2, 1, ot.getLastRow() - 1, SUTUN_SAYISI).setBackground(null);
    hatalar.filter(function (h) { return h.sekme === 'Oturumlar'; }).forEach(function (h) {
      ot.getRange(h.satir, 1, 1, SUTUN_SAYISI).setBackground(HATA_RENGI);
    });
  }
  return durum + '. ' + ozetMetni;
}
