import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SummaryRequest {
  userId: string
  userMaterialId: string
  periodType: 'weekly' | 'monthly'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const claudeApiKey = Deno.env.get('CLAUDE_API_KEY')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { userId, userMaterialId, periodType }: SummaryRequest = await req.json()

  const now = new Date()
  let periodStart: Date
  let periodEnd: Date = now

  if (periodType === 'weekly') {
    periodStart = new Date(now)
    periodStart.setDate(now.getDate() - 7)
  } else {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const { data: attempts } = await supabase
    .from('material_attempts')
    .select(`
      *,
      question:questions(question_text, keywords)
    `)
    .eq('user_id', userId)
    .eq('user_material_id', userMaterialId)
    .gte('attempted_at', periodStart.toISOString())
    .lte('attempted_at', periodEnd.toISOString())

  if (!attempts || attempts.length === 0) {
    return new Response(JSON.stringify({ error: 'No attempts found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: material } = await supabase
    .from('user_materials')
    .select('nickname, shared_material:shared_materials(title)')
    .eq('id', userMaterialId)
    .single()

  const avgScore = attempts.reduce((sum: number, a: any) => sum + (a.ai_score ?? 0), 0) / attempts.length

  const summaryPrompt = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'あなたは学習コーチです。以下の学習データを分析し、必ずJSONのみで返してください。',
    messages: [{
      role: 'user',
      content: `教材名: ${material?.nickname ?? '教材'}
期間: ${periodStart.toLocaleDateString('ja-JP')} 〜 ${periodEnd.toLocaleDateString('ja-JP')}
取り組み問題数: ${attempts.length}問
平均スコア: ${Math.round(avgScore)}点
問題ごとの結果: ${JSON.stringify(attempts.map((a: any) => ({
  question: a.question?.question_text?.substring(0, 80),
  score: a.ai_score,
  missing: a.missing_keywords,
  attempts: a.attempt_count,
})))}

以下をJSONで返してください:
{
  "weak_units": [{"unit": "単元名", "avg_score": 42, "count": 5}],
  "frequent_missing_kw": ["キーワード1", "キーワード2"],
  "ai_summary_text": "自然言語のまとめ（3〜5文）",
  "recommended_pages": [{"chapter": "第3章", "reason": "理由"}]
}`,
    }],
  }

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(summaryPrompt),
  })

  const claudeData = await claudeRes.json()
  const rawText = claudeData.content?.[0]?.text ?? '{}'

  let parsed: any = {}
  try {
    parsed = JSON.parse(rawText.replace(/```json\n?|\n?```/g, '').trim())
  } catch {
    parsed = { ai_summary_text: rawText, weak_units: [], frequent_missing_kw: [], recommended_pages: [] }
  }

  const { data: summary, error } = await supabase
    .from('material_summaries')
    .insert({
      user_id: userId,
      user_material_id: userMaterialId,
      period_type: periodType,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      total_attempts: attempts.length,
      avg_score: Math.round(avgScore),
      weak_units: parsed.weak_units ?? [],
      frequent_missing_kw: parsed.frequent_missing_kw ?? [],
      ai_summary_text: parsed.ai_summary_text ?? '',
      recommended_pages: parsed.recommended_pages ?? [],
    })
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
