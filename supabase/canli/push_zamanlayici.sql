-- Yalnızca canlı projede (yerel test veritabanında pg_cron/pg_net yok).
-- Her dakika push-gonder Edge Function'ını çağırır. Anahtar Vault'ta: 'push_cron_anahtari'.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'push-gonder';
select cron.schedule('push-gonder', '* * * * *', $$
  select net.http_post(
    url := 'https://nvcfbawzmkhryixpntps.supabase.co/functions/v1/push-gonder',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-mentormap-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_anahtari')),
    body := '{}'::jsonb, timeout_milliseconds := 20000)
$$);
