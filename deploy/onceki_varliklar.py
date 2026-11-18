# Canlıdaki son sürümlerin /assets dosyalarını yeni derlemeye ekler. Böylece eski index.html'i önbellekte kalan
# tarayıcı, yeni sürüm yayınlandıktan sonra da açılır ve sonraki yüklemede kendini günceller.
# Son SAKLA sürümün listesi /varlik-gecmisi.json'da tutulur (yeni sürüm başa eklenir).
# Kullanım: python3 onceki_varliklar.py <dist> <canlı adres>
import json, os, re, sys, urllib.error, urllib.request

SAKLA = 5
dist, adres = sys.argv[1], sys.argv[2].rstrip("/")

def al(yol):
    try:
        with urllib.request.urlopen(adres + yol, timeout=30) as r:
            return r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, "", b""

def varliklar(html):
    return sorted(set(re.findall(r'/assets/[A-Za-z0-9._-]+\.(?:js|css)', html)))

yeni = varliklar(open(os.path.join(dist, "index.html"), encoding="utf-8").read())
durum, tip, govde = al("/varlik-gecmisi.json")
gecmis = json.loads(govde) if durum == 200 and "json" in tip else []
if not gecmis:  # ilk kullanım: canlıdaki index.html'in dosyaları
    _, _, html = al("/")
    gecmis = [varliklar(html.decode("utf-8", "replace"))]
gecmis = [yeni] + [s for s in gecmis if s != yeni][: SAKLA - 1]

eklenen = 0
for y in sorted({y for s in gecmis[1:] for y in s}):
    hedef = os.path.join(dist, y.lstrip("/"))
    if os.path.exists(hedef):
        continue
    durum, tip, govde = al(y)
    if durum != 200 or "html" in tip:
        print("atlandı", y, durum); continue
    with open(hedef, "wb") as f:
        f.write(govde)
    eklenen += 1
json.dump(gecmis, open(os.path.join(dist, "varlik-gecmisi.json"), "w"))
print(f"önceki {len(gecmis) - 1} sürümden {eklenen} dosya eklendi")
