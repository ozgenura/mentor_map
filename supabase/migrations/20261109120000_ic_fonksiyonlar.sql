-- İç yardımcılar yalnızca tetikleyicilerden ve security definer RPC'lerden çağrılır; istemci doğrudan çağıramaz.
-- (Supabase güvenlik denetimi: authenticated_security_definer_function_executable)
revoke execute on function public._anlaticilari_yaz(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.bildirim_kuyruga_ekle(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.kisi_token_olustur() from public, anon, authenticated;
revoke execute on function public.oturum_kaydet() from public, anon, authenticated;
