import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UploadRequest {
  fileBase64: string
  fileName: string
  mimeType: string
  userId: string
  goalId: string
  nickname?: string
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function callClaude(apiKey: string, system: string, userMessage: string, maxTokens = 2048): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })
  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

async function extractTextFromImage(apiKey: string, base64: string, mimeType: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: 'この画像に含まれるすべてのテキストを正確に抽出してください。教材・参考書の場合は章・節の構造も保持してください。',
          },
        ],
      }],
    }),
  })
  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const claudeApiKey = Deno.env.get('CLAUDE_API_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { fileBase64, fileName, mimeType, userId, goalId, nickname }: UploadRequest = await req.json()

    // Step 1: compute hash for deduplication
    const fileHash = await sha256Hex(fileBase64)

    // Step 2: check for existing material
    const { data: existing } = await supabase
      .from('shared_materials')
      .select('id, questions_generated')
      .eq('file_hash', fileHash)
      .single()

    let sharedMaterialId: string
    let questionCount = 0
    let isNew = false

    if (existing) {
      sharedMaterialId = existing.id
      await supabase
        .from('shared_materials')
        .update({ upload_count: supabase.rpc('increment', { x: existing.upload_count ?? 1 }) })
        .eq('id', sharedMaterialId)

      const { count } = await supabase
        .from('questions')
        .select('id', { count: 'exact' })
        .eq('shared_material_id', sharedMaterialId)
      questionCount = count ?? 0
    } else {
      isNew = true

      // Step 3: upload file to Storage
      const fileExt = fileName.split('.').pop()
      const storagePath = `materials/${userId}/${fileHash}.${fileExt}`
      const fileBytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0))

      await supabase.storage
        .from('materials')
        .upload(storagePath, fileBytes, { contentType: mimeType, upsert: false })

      // Step 4: extract text
      let extractedText = ''
      if (mimeType.startsWith('image/')) {
        extractedText = await extractTextFromImage(claudeApiKey, fileBase64, mimeType)
      } else {
        // For PDFs, use Claude vision if it's a valid image format, otherwise note limitation
        extractedText = await callClaude(
          claudeApiKey,
          'あなたはOCRエンジンです。渡されたテキストをそのまま返してください。',
          `このファイル（${fileName}）はPDFです。テキスト抽出はサーバーサイドのpdf-parseライブラリが必要です。このメッセージは開発用プレースホルダーです。`,
        )
      }

      // Step 5: generate summary
      const summary = await callClaude(
        claudeApiKey,
        'あなたは教育コンテンツの専門家です。与えられた教材テキストの要約を3〜5文で作成してください。',
        `教材テキスト:\n${extractedText.substring(0, 8000)}`,
        512,
      )

      // Step 6: insert shared_material
      const { data: newMaterial } = await supabase
        .from('shared_materials')
        .insert({
          file_hash: fileHash,
          title: nickname ?? fileName.replace(/\.[^/.]+$/, ''),
          file_path: storagePath,
          extracted_text: extractedText,
          summary,
          questions_generated: false,
        })
        .select()
        .single()

      sharedMaterialId = newMaterial!.id

      // Step 7: generate questions
      const questionsRaw = await callClaude(
        claudeApiKey,
        `あなたは教育テスト作成の専門家です。
与えられた教材テキストから記述式問題を生成し、必ず以下のJSON形式のみで返してください。
{
  "questions": [
    {
      "type": "short_answer",
      "question_text": "問題文",
      "correct_answer": "模範解答",
      "keywords": ["必須キーワード1"],
      "rubric": {"keywords": ["必須キーワード1"], "min_length": 20, "strictness": "standard"},
      "points": 10,
      "explanation": "解説文",
      "difficulty": 3
    }
  ]
}`,
        `教材:\n${extractedText.substring(0, 8000)}\n\n問題数: 10問\n種類: short_answer 7問・long_answer 3問\n難易度: 中級\n対象: 高校生・大学受験`,
        4096,
      )

      let questions: any[] = []
      try {
        const cleaned = questionsRaw.replace(/```json\n?|\n?```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        questions = parsed.questions ?? []
      } catch {
        questions = []
      }

      if (questions.length > 0) {
        const questionRows = questions.map((q: any) => ({
          shared_material_id: sharedMaterialId,
          goal_id: goalId,
          type: q.type ?? 'short_answer',
          question_text: q.question_text,
          correct_answer: q.correct_answer,
          keywords: q.keywords ?? [],
          rubric: q.rubric ?? { keywords: [], min_length: 20, strictness: 'standard' },
          points: q.points ?? 10,
          explanation: q.explanation ?? '',
          difficulty: q.difficulty ?? 3,
        }))

        await supabase.from('questions').insert(questionRows)
        await supabase
          .from('shared_materials')
          .update({ questions_generated: true })
          .eq('id', sharedMaterialId)

        questionCount = questions.length
      }
    }

    // Step 8: link to user_materials
    const { data: existing_um } = await supabase
      .from('user_materials')
      .select('id')
      .eq('user_id', userId)
      .eq('shared_material_id', sharedMaterialId)
      .single()

    if (!existing_um) {
      await supabase.from('user_materials').insert({
        user_id: userId,
        shared_material_id: sharedMaterialId,
        goal_id: goalId,
        nickname: nickname ?? null,
      })
    }

    return new Response(
      JSON.stringify({ sharedMaterialId, questionCount, isNew }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
