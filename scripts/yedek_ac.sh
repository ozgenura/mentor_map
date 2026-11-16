#!/usr/bin/env bash
# Şifreli Mentor Map yedeğini açar ve (istenirse) bir veritabanına geri yükler.
#   scripts/yedek_ac.sh mentormap.dump.gpg                 -> mentormap.dump üretir, içindekileri sayar
#   scripts/yedek_ac.sh mentormap.dump.gpg "postgresql://…" -> ayrıca o veritabanına yükler
# Parola sorulur (ya da YEDEK_PAROLASI ortam değişkeninden okunur). Hedef veritabanının public şeması boş
# olmalı: canlı veritabanına doğrudan yüklemeyin, önce boş bir projede deneyin.
set -euo pipefail
GIRDI=${1:?şifreli yedek dosyası gerekli}
HEDEF=${2:-}
CIKTI=${GIRDI%.gpg}
if [ -n "${YEDEK_PAROLASI:-}" ]; then
  printf '%s' "$YEDEK_PAROLASI" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 -d -o "$CIKTI" "$GIRDI"
else
  gpg --yes -d -o "$CIKTI" "$GIRDI"
fi
echo "Tablo verisi sayısı: $(pg_restore --list "$CIKTI" | grep -c 'TABLE DATA')"
if [ -n "$HEDEF" ]; then
  # Hedefte public şeması zaten var (Supabase'de her zaman): şemayı yaratma adımı atlanır.
  LISTE=$(mktemp)
  pg_restore --list "$CIKTI" | grep -v ' SCHEMA - public ' > "$LISTE"
  pg_restore --no-owner --exit-on-error -L "$LISTE" -d "$HEDEF" "$CIKTI"
  rm -f "$LISTE"
  echo "Yüklendi."
fi
