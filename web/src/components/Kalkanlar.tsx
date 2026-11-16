// Yönetici: şablondan (Sheets) silindiği için takvimlerden kalkan oturumlar (MM-01).
// Satır şablona geri eklenirse bir sonraki senkronda kendiliğinden geri gelir; burada yalnızca kalıcı silinir.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useBaglam } from "../lib/baglam";
import { gunBasligi, saatAraligi } from "../lib/time";
import { BootcampEtiketi, Kart } from "./ui";

export function KalkanlarListesi() {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const [onay, setOnay] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["kalkanlar"], queryFn: api.kalkanlar });
  const sil = useMutation({
    mutationFn: (id: string) => api.kalkanSil(id),
    onSuccess: () => { setOnay(null); qc.invalidateQueries({ queryKey: ["kalkanlar"] }); },
  });
  const list = q.data ?? [];
  return (
    <Kart className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-baslik text-lg font-bold">Programdan kalkan oturumlar {list.length > 0 && <span className="text-soluk">· {list.length}</span>}</h2>
        <p className="text-[13px] text-soluk">
          Şablondan silindiği için takvimlerde ve aboneliklerde görünmüyor. Yanlışlıkla silindiyse satırı şablona geri ekleyin;
          bir sonraki senkronda geri gelir.
        </p>
      </div>
      {q.isLoading ? <span className="text-sm text-soluk">Yükleniyor…</span> : list.length === 0 ? (
        <span className="text-sm text-soluk">Kalkan oturum yok.</span>
      ) : (
        <ul className="flex flex-col divide-y divide-cizgi">
          {list.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-sm font-semibold"><BootcampEtiketi kod={o.kisa_kod} renk={o.renk} /> {o.konu || o.tur}</span>
                <span className="text-xs text-soluk">{gunBasligi(o.tarih)}{saatAraligi(o) ? ` · ${saatAraligi(o)}` : ""}</span>
              </span>
              {onay === o.id ? (
                <span className="flex gap-2">
                  <button onClick={() => sil.mutate(o.id)} disabled={sil.isPending}
                    className="h-9 rounded-full bg-mercan-koyu px-3 text-xs font-bold text-white">Kalıcı sil</button>
                  <button onClick={() => setOnay(null)} className="h-9 rounded-full border border-cizgi px-3 text-xs font-semibold">Vazgeç</button>
                </span>
              ) : (
                <button onClick={() => setOnay(o.id)} className="h-9 rounded-full border border-cizgi px-3 text-xs font-semibold">Sil…</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sil.isError && <p className="text-sm font-semibold text-mercan-koyu">Silinemedi: {(sil.error as Error).message}</p>}
    </Kart>
  );
}
