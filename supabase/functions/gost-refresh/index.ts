import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { productLabels } = await req.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Ты эксперт по хранению алкогольной продукции в России.
Для следующих видов продукции: ${productLabels.join(', ')}
Предоставь краткую справку по условиям хранения согласно актуальным ГОСТам.
Для каждого вида укажи: ГОСТ, диапазон температур, влажность, требования к свету, расстояние от стен.
Отвечай строго в формате JSON массива объектов с полями:
productKey, gost, tempMin, tempMax, humidityMin, humidityMax, lightRestriction, wallDistance, ventilation, notes
Только JSON, без markdown, без пояснений.`
        }]
      })
    })

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''
    const clean = text.replace(/```json|```/g, '').trim()
    const norms = JSON.parse(clean)

    return new Response(JSON.stringify({ norms }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
