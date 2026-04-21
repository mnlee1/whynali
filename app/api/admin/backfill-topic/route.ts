import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { getAIClient } from '@/lib/ai/ai-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* POST /api/admin/backfill-topic
 * topic_description이 NULL인 기존 이슈에 AI로 topic/topic_description 자동 채우기
 * Body: { secret: string, limit?: number }
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const limit = Math.min(Number(body.limit ?? 10), 30)
    const admin = createSupabaseAdminClient()

    // topic_description이 NULL인 이슈 조회
    const { data: issues, error } = await admin
        .from('issues')
        .select('id, title, description, category')
        .eq('approval_status', '승인')
        .is('topic_description', null)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!issues || issues.length === 0) {
        return NextResponse.json({ message: '채울 이슈가 없습니다.', updated: 0 })
    }

    const ai = getAIClient()
    const results: { id: string; title: string; success: boolean }[] = []

    for (const issue of issues) {
        try {
            const prompt = `다음 이슈에 대해 주제명과 설명을 작성해줘.

이슈 제목: ${issue.title}
카테고리: ${issue.category}
${issue.description ? `이슈 설명: ${issue.description}` : ''}

작성 규칙:
- topic: 이슈의 핵심 주제를 15자 이내로 (예: "옥택연 결혼", "갤럭시 S26 공개")
- topic_description: 이슈 핵심 내용을 2~3줄, 60~100자로 설명 (누가 무엇을 했는지 구체적 사실 중심)

응답 형식 (JSON만):
{"topic": "...", "topic_description": "..."}`

            const content = await ai.complete(prompt, { temperature: 0.2, max_tokens: 200 })
            const result = parseJsonObject<{ topic: string; topic_description: string }>(content)

            if (result?.topic && result?.topic_description) {
                await admin
                    .from('issues')
                    .update({
                        topic: result.topic,
                        topic_description: result.topic_description,
                    })
                    .eq('id', issue.id)

                results.push({ id: issue.id, title: issue.title, success: true })
            } else {
                results.push({ id: issue.id, title: issue.title, success: false })
            }
        } catch {
            results.push({ id: issue.id, title: issue.title, success: false })
        }
    }

    const updated = results.filter(r => r.success).length
    return NextResponse.json({
        message: `${updated}/${issues.length}개 이슈 업데이트 완료`,
        updated,
        results,
    })
}
