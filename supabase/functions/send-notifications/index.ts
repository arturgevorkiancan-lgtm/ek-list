import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ClientRef = { name: string; user_id: string } | null

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  webpush.setVapidDetails(
    'mailto:' + Deno.env.get('VAPID_EMAIL'),
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const notifications: {
    endpoint: string
    p256dh: string
    auth: string
    title: string
    body: string
    url: string
  }[] = []

  const { data: licenses } = await supabase
    .from('licenses')
    .select('client_id, expiry_date, clients(name, user_id)')

  for (const lic of licenses ?? []) {
    const days = Math.ceil(
      (new Date(lic.expiry_date).getTime() - now.getTime()) / 86400000,
    )
    if (days === 90 || days === 30 || days === 7) {
      const client = lic.clients as ClientRef
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', client?.user_id)
      for (const sub of subs ?? []) {
        notifications.push({
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          title: `Лицензия истекает через ${days} дней`,
          body: client?.name ?? '',
          url: '/',
        })
      }
    }
  }

  const yesterday = new Date(now.getTime() - 86400000).toISOString()
  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id, name, user_id, client_id')

  for (const wh of warehouses ?? []) {
    const { data: readings } = await supabase
      .from('storage_readings')
      .select('recorded_at')
      .eq('warehouse_id', wh.id)
      .gte('recorded_at', yesterday)
      .limit(1)

    if (!readings?.length) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', wh.user_id)
      for (const sub of subs ?? []) {
        notifications.push({
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          title: 'Нет записи в журнале хранения',
          body: `Склад: ${wh.name} — более 24 часов`,
          url: '/',
        })
      }
    }
  }

  let sent = 0
  for (const n of notifications) {
    try {
      await webpush.sendNotification(
        { endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } },
        JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.endpoint }),
      )
      sent++
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', n.endpoint)
      }
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
