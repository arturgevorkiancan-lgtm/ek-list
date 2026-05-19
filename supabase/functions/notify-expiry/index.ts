import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildExpiryEmailHtml,
  buildExpiryEmailSubject,
  type ExpiryEmailData,
} from './email-template.ts'

const WARNING_DAYS = [180, 95, 30] as const
type WarningDay = (typeof WARNING_DAYS)[number]

const WARNING_LEVEL: Record<WarningDay, ExpiryEmailData['warningLevel']> = {
  180: '6m',
  95: '95d',
  30: '30d',
}

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function daysUntil(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(isoDate + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function targetDateString(daysFromNow: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

async function sendResendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') ?? 'ЧЕК-Лист <notifications@example.com>',
      to: [to],
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error: ${res.status} ${body}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const notifyEmail = Deno.env.get('NOTIFY_EMAIL')
  const appUrl = Deno.env.get('APP_URL') ?? 'https://example.com'
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const sent: string[] = []
  const errors: string[] = []

  for (const days of WARNING_DAYS) {
    const expiryOn = targetDateString(days)
    const { data: licenses, error } = await supabase
      .from('licenses')
      .select('id, license_number, expiry_date, client_id, clients(name)')
      .eq('expiry_date', expiryOn)

    if (error) {
      errors.push(`${days}d: ${error.message}`)
      continue
    }

    for (const lic of licenses ?? []) {
      const client = lic.clients as { name: string } | null
      const orgName = client?.name ?? 'Клиент'
      const remaining = daysUntil(lic.expiry_date)
      const emailData: ExpiryEmailData = {
        orgName,
        licenseNumber: lic.license_number ?? '—',
        expiryDate: formatDateRu(lic.expiry_date),
        daysRemaining: remaining,
        checklistUrl: `${appUrl}/clients/${lic.client_id}`,
        warningLevel: WARNING_LEVEL[days],
      }

      if (!notifyEmail) {
        sent.push(`dry-run:${lic.id}:${days}d`)
        continue
      }

      try {
        await sendResendEmail(
          resendKey,
          notifyEmail,
          buildExpiryEmailSubject(orgName),
          buildExpiryEmailHtml(emailData),
        )
        sent.push(`${lic.id}:${days}d`)
      } catch (e) {
        errors.push(`${lic.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return new Response(JSON.stringify({ sent, errors }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
