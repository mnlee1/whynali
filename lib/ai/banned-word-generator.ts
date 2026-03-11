/**
 * lib/ai/banned-word-generator.ts
 *
 * [AI 금칙어 자동 생성기]
 *
 * pending_review 상태인 댓글 배치를 Groq API에 전달하여
 * 욕설/혐오 단어를 추출하고 safety_rules 테이블에 ai_banned_word로 저장한다.
 *
 * AI: Groq (Llama 3.3)
 */

import { incrementApiUsage } from '@/lib/api-usage-tracker'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface BannedWordGenerateResult {
    inserted: number
    skipped: number
    words: string[]
}

/**
 * generateBannedWords - pending_review 댓글 분석 → 금칙어 추출 → DB 저장
 *
 * 예시:
 *   const result = await generateBannedWords(supabaseAdmin)
 */
export async function generateBannedWords(
    adminClient: SupabaseClient
): Promise<BannedWordGenerateResult> {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
        throw new Error('GROQ_API_KEY 환경변수가 설정되지 않았습니다.')
    }

    /* pending_review 댓글 최대 50개 조회 */
    const { data: comments, error: fetchError } = await adminClient
        .from('comments')
        .select('id, body')
        .eq('visibility', 'pending_review')
        .order('created_at', { ascending: true })
        .limit(50)

    if (fetchError) throw new Error(`댓글 조회 실패: ${fetchError.message}`)
    if (!comments || comments.length === 0) {
        return { inserted: 0, skipped: 0, words: [] }
    }

    /* Groq API 호출 */
    const bodies = comments.map((c: { body: string }) => c.body).filter(Boolean)

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content:
                        '당신은 한국어 욕설/혐오 표현 탐지 전문가입니다. ' +
                        '주어진 댓글 목록에서 욕설, 혐오 표현, 비하 단어만 추출하세요. ' +
                        '반드시 JSON 배열 형태로만 응답하세요. ' +
                        '문장이 아닌 단어/표현 단위로 추출하고, 최대 20개까지만 반환하세요.',
                },
                {
                    role: 'user',
                    content: buildPrompt(bodies),
                },
            ],
            temperature: 0.2,
            max_tokens: 500,
            response_format: { type: 'json_object' },
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        await incrementApiUsage('groq', { calls: 1, successes: 0, failures: 1 })
            .catch((e) => console.error('API 사용량 추적 실패:', e))
        throw new Error(`Groq API 오류 (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const raw: string = data.choices?.[0]?.message?.content ?? ''

    await incrementApiUsage('groq', { calls: 1, successes: 1, failures: 0 })
        .catch((e) => console.error('API 사용량 추적 실패:', e))

    const extracted = parseWords(raw)
    if (extracted.length === 0) {
        return { inserted: 0, skipped: 0, words: [] }
    }

    /* 중복 단어 조회 — banned_word, excluded_word에 있는 단어는 재생성 차단 */
    /* excluded_word: 관리자가 명시적으로 제외 처리한 단어이므로 재생성하지 않음 */
    /* banned_word: 이미 수동 등록된 단어이므로 중복 추가하지 않음 */
    const { data: existing } = await adminClient
        .from('safety_rules')
        .select('value')
        .in('value', extracted)
        .in('kind', ['banned_word', 'excluded_word'])

    const existingSet = new Set((existing ?? []).map((r: { value: string }) => r.value))
    const newWords = extracted.filter((w) => !existingSet.has(w))
    const skipped = extracted.length - newWords.length

    if (newWords.length === 0) {
        return { inserted: 0, skipped, words: [] }
    }

    /* 신규 단어 INSERT */
    const rows = newWords.map((value) => ({ kind: 'ai_banned_word', value }))
    const { error: insertError } = await adminClient.from('safety_rules').insert(rows)

    if (insertError) throw new Error(`금칙어 저장 실패: ${insertError.message}`)

    return { inserted: newWords.length, skipped, words: newWords }
}

function buildPrompt(bodies: string[]): string {
    const list = bodies.map((b, i) => `${i + 1}. ${b}`).join('\n')
    return `다음 댓글들에서 욕설, 혐오 표현, 비하 단어만 추출해주세요.

댓글 목록:
${list}

JSON 형식으로만 응답:
{
  "words": ["단어1", "단어2"]
}`
}

function parseWords(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw)
        const arr = parsed.words ?? parsed
        if (Array.isArray(arr)) {
            return arr
                .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
                .map((w) => w.trim().substring(0, 50))
        }
        const match = raw.match(/\[[\s\S]*?\]/)
        if (!match) return []
        const fallback: unknown[] = JSON.parse(match[0])
        return fallback
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((w) => w.trim().substring(0, 50))
    } catch (e) {
        console.error('금칙어 파싱 실패:', e, 'Raw:', raw)
        return []
    }
}
