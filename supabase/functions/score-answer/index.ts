import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AnswerInput {
  questionId: string
  userAnswer: string
  timeSpentSec: number
}

interface ScoreRequest {
  sessionId: string
  answers: AnswerInput[]
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

    const { sessionId, answers }: ScoreRequest = await req.json()

    // Fetch session and goal
    const { data: session } = await supabase
      .from('test_sessions')
      .select('*, goal:goals(pass_score, user_id:user_id)')
      .eq('id', sessionId)
      .single()

    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const passScore = session.goal?.pass_score ?? 70
    const userId = session.user_id

    // Score each answer
    const scoredAnswers = await Promise.all(
      answers.map(async (answer) => {
        const { data: question } = await supabase
          .from('questions')
          .select('*')
          .eq('id', answer.questionId)
          .single()

        if (!question) {
          return { questionId: answer.questionId, score: 0, feedback: '問題が見つかりません', missingKeywords: [] }
        }

        const scoringPrompt = `【問題】${question.question_text}
【模範解答】${question.correct_answer}
【採点基準】必須キーワード: ${(question.keywords ?? []).join(', ')}
【配点】${question.points}点
【回答】${answer.userAnswer}`

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': claudeApiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            system: `あなたは採点者です。以下のルールで採点し、必ずJSONのみ返してください。
{
  "score": 0〜100の整数,
  "passed": true | false,
  "missing_points": ["不足していた要点1"],
  "feedback": "具体的なフィードバックコメント（日本語）"
}
・模範解答と意味が合っていれば表現が違っても正解とする
・必須キーワードが含まれていない場合は減点
・strictnessが"strict"の場合はキーワードを必須とする`,
            messages: [{ role: 'user', content: scoringPrompt }],
          }),
        })

        const claudeData = await claudeRes.json()
        const rawText = claudeData.content?.[0]?.text ?? '{}'

        let scored: any = { score: 0, passed: false, missing_points: [], feedback: '' }
        try {
          scored = JSON.parse(rawText.replace(/```json\n?|\n?```/g, '').trim())
        } catch {
          scored = { score: 0, passed: false, missing_points: [], feedback: rawText }
        }

        const aiScore = Math.round((scored.score / 100) * question.points)
        const isCorrect = scored.passed === true

        await supabase.from('test_answers').insert({
          session_id: sessionId,
          question_id: answer.questionId,
          user_answer: answer.userAnswer,
          ai_score: aiScore,
          ai_feedback: scored.feedback,
          missing_keywords: scored.missing_points ?? [],
          is_correct: isCorrect,
          time_spent_sec: answer.timeSpentSec,
        })

        return {
          questionId: answer.questionId,
          score: aiScore,
          maxPoints: question.points,
          feedback: scored.feedback,
          missingKeywords: scored.missing_points ?? [],
          isCorrect,
        }
      }),
    )

    // Calculate total score
    const totalPoints = scoredAnswers.reduce((sum: number, a: any) => sum + (a.maxPoints ?? 10), 0)
    const earnedPoints = scoredAnswers.reduce((sum: number, a: any) => sum + (a.score ?? 0), 0)
    const totalScore = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
    const passed = totalScore >= passScore

    // Update test_session
    await supabase
      .from('test_sessions')
      .update({ score: totalScore, passed, restriction_active: !passed })
      .eq('id', sessionId)

    if (!passed) {
      // Add failed questions to retry_queue
      for (const answer of scoredAnswers) {
        if (!answer.isCorrect) {
          const { data: existing } = await supabase
            .from('retry_queue')
            .select('id, fail_count')
            .eq('user_id', userId)
            .eq('question_id', answer.questionId)
            .eq('status', 'pending')
            .single()

          if (existing) {
            const newFailCount = (existing.fail_count ?? 1) + 1
            const nextRetry = new Date()
            const intervals = [1, 3, 7, 14]
            nextRetry.setDate(nextRetry.getDate() + intervals[Math.min(newFailCount - 1, 3)])
            await supabase
              .from('retry_queue')
              .update({ fail_count: newFailCount, next_retry_at: nextRetry.toISOString().split('T')[0] })
              .eq('id', existing.id)
          } else {
            const nextRetry = new Date()
            nextRetry.setDate(nextRetry.getDate() + 1)
            await supabase.from('retry_queue').insert({
              user_id: userId,
              question_id: answer.questionId,
              next_retry_at: nextRetry.toISOString().split('T')[0],
            })
          }
        }
      }
    } else {
      // Update streak
      const { data: user } = await supabase
        .from('users')
        .select('streak_count, streak_updated_at')
        .eq('id', userId)
        .single()

      if (user) {
        const lastUpdated = user.streak_updated_at ? new Date(user.streak_updated_at) : null
        const now = new Date()
        const today = now.toISOString().split('T')[0]
        const lastDay = lastUpdated?.toISOString().split('T')[0]

        let newStreak = user.streak_count ?? 0
        if (lastDay !== today) {
          newStreak += 1
        }

        await supabase
          .from('users')
          .update({ streak_count: newStreak, streak_updated_at: now.toISOString() })
          .eq('id', userId)

        // Check badges
        const badgesToGrant: string[] = []
        if (newStreak === 7 || newStreak === 14 || newStreak === 30) {
          badgesToGrant.push(`streak_${newStreak}`)
        }

        const { count: sessionCount } = await supabase
          .from('test_sessions')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)
          .eq('passed', true)
        if (sessionCount === 1) badgesToGrant.push('first_pass')

        for (const badgeType of badgesToGrant) {
          const { count: existing } = await supabase
            .from('badges')
            .select('id', { count: 'exact' })
            .eq('user_id', userId)
            .eq('badge_type', badgeType)
          if (!existing || existing === 0) {
            await supabase.from('badges').insert({ user_id: userId, badge_type: badgeType })
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ score: totalScore, passed, answers: scoredAnswers }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
