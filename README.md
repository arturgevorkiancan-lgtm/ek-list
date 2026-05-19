<<<<<<< HEAD
# ek-list
Получение реестр с сайта Росалкогольтабакконтроль 
=======
# ЧЕК-Лист

Веб-приложение для чеклистов лицензирования алкогольной продукции.

## Запуск

```bash
npm install
npm run dev
```

## Supabase

Схема БД: `supabase/schema.sql`

### Email-уведомления о сроке лицензии

Edge Function: `supabase/functions/notify-expiry`

Расписание (ежедневно в 09:00, Москва): см. `supabase/config.toml`

**Секреты Supabase** (Dashboard → Project Settings → Edge Functions → Secrets или CLI):

| Переменная | Описание |
|------------|----------|
| `RESEND_API_KEY` | API-ключ [Resend](https://resend.com) |
| `RESEND_FROM` | Отправитель, напр. `ЧЕК-Лист <notify@yourdomain.com>` |
| `NOTIFY_EMAIL` | Email получателя уведомлений |
| `APP_URL` | Базовый URL приложения (ссылки в письмах) |

```bash
supabase secrets set RESEND_API_KEY=re_xxxx
supabase secrets set NOTIFY_EMAIL=manager@example.com
supabase secrets set APP_URL=https://your-app.example.com
supabase functions deploy notify-expiry
```

Функция отправляет письма, когда до `expiry_date` остаётся ровно **180**, **95** или **30** дней.

### Edge Functions: обновление норм хранения (ГОСТ)

Edge Function: `supabase/functions/gost-refresh`

Проксирует запрос к Anthropic API, чтобы ключ не попадал во фронтенд-бандл.

**Секрет Supabase** (Dashboard → Project Settings → Edge Functions → Secrets):

| Переменная | Описание |
|------------|----------|
| `ANTHROPIC_API_KEY` | API-ключ [Anthropic](https://console.anthropic.com) |

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxx
supabase functions deploy gost-refresh
```

## PDF

Экспорт чеклиста: `@react-pdf/renderer` с шрифтом Roboto (кириллица). Шрифты в `src/assets/fonts/`.

Парсинг ЕГРН и лицензий из PDF: `pdfjs-dist`.

## Push-уведомления (PWA)

Браузерные push для менеджеров: истечение лицензии (90 / 30 / 7 дней) и отсутствие записи в журнале хранения более 24 ч по складу.

### 1. Таблица подписок (выполнить в SQL Editor Supabase)

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_push" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Для рассылки по клиентам/складам в Edge Function нужны колонки `user_id` на `clients` и `warehouses` (если ещё не добавлены).

### 2. VAPID-ключи

```bash
npx web-push generate-vapid-keys
```

Локально в `.env`:

```
VITE_VAPID_PUBLIC_KEY=<public key>
```

**Секреты Supabase** (не коммитить приватный ключ):

```bash
supabase secrets set VAPID_PUBLIC_KEY=<public>
supabase secrets set VAPID_PRIVATE_KEY=<private>
supabase secrets set VAPID_EMAIL=your@email.com
```

`SUPABASE_SERVICE_ROLE_KEY` для Edge Functions обычно уже доступен в среде Supabase; при локальном вызове можно задать явно из Dashboard → Settings → API.

### 3. Edge Function

```bash
supabase functions deploy send-notifications
```

Функция: `supabase/functions/send-notifications`

### 4. Расписание (ежедневно)

**Вариант A (бесплатно):** GitHub Actions — `.github/workflows/notify.yml` (08:00 UTC). В репозитории задайте secret `SUPABASE_ANON_KEY`.

**Вариант B (платно):** расширение `pg_cron` в Supabase.

Ручной вызов:

```bash
curl -X POST https://xcldnsbnzuplsrwahrcf.supabase.co/functions/v1/send-notifications \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json"
```

### 5. iOS Safari

Push в PWA на iOS 16.4+ работает только для приложения, добавленного на экран «Домой», с HTTPS.
>>>>>>> 8c5d7b9 (initial commit)
