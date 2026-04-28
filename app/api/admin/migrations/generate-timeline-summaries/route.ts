/**
 * app/api/admin/migrations/generate-timeline-summaries/route.ts
 *
 * 기존 이슈의 timeline_points로 timeline_summaries + brief_summary 일괄 생성
 *
 * 사용법:
 *   POST /api/admin/migrations/generate-timeline-summaries
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const STAGE_ORDER: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3 }

async function generateSummariesForIssue(
    issueId: string,
    issueTitle: string,
): Promise<number> {
    const { data: points } = await supabaseAdmin
        .from('timeline_points')
        .select('stage, title, occurred_at')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })

    if (!points || points.length === 0) return 0

    // timeline_points가 너무 많으면 최근 50개만 사용 (토큰 제한 방지)
    const limitedPoints = points.length > 50 ? points.slice(-50) : points

    const grouped = new Map<string, Array<{ title: string; occurred_at: string }>>()
    for (const p of limitedPoints) {
        if (!grouped.has(p.stage)) grouped.set(p.stage, [])
        grouped.get(p.stage)!.push({ title: p.title ?? '', occurred_at: p.occurred_at })
    }

    const stages = [...grouped.keys()].sort(
        (a, b) => (STAGE_ORDER[a] ?? 9) - (STAGE_ORDER[b] ?? 9)
    )

    const stagesText = stages.map(stage => {
        const items = grouped.get(stage)!
        const lines = items.map(i => {
            const dt = new Date(i.occurred_at)
            const dateStr = !isNaN(dt.getTime())
                ? `${dt.getMonth() + 1}월 ${dt.getDate()}일`
                : ''
            return dateStr ? `- [${dateStr}] ${i.title}` : `- ${i.title}`
        }).join('\n')
        return `[${stage}]\n${lines}`
    }).join('\n\n')

    const prompt = `이슈: "${issueTitle}"

다음은 이 이슈와 관련된 뉴스 기사 제목들입니다.
각 단계는 [발단], [전개], [파생], [진정]으로 구분되어 있습니다.

${stagesText}

## 중요: 단계별 독립 요약 원칙
- **각 단계는 해당 단계의 뉴스만 사용**해서 요약하세요
- 예: [발단] 요약 시 [전개]나 [파생]의 뉴스는 절대 사용하지 마세요
- **중복된 내용의 뉴스는 하나만 선택**하세요 (예: "본격화" 제목이 3개면 1개만 사용)
- **bullets 개수는 해당 단계의 뉴스 개수를 초과하지 마세요**

## 법적 안전성 준수
- 위 기사 제목에 있는 내용만 사용하세요
- 기사 본문은 없으므로 제목에 없는 내용을 추측하지 마세요

## 요청사항
위 원칙을 엄격히 지켜 각 단계를 독립적으로 요약해주세요.

**출력 형식:**
1. 각 단계를 "발단/전개/파생/진정" 중 하나로 분류
2. 각 단계의 핵심 사건들을 bullet points로 (1~5개, 해당 단계 뉴스 개수 이하)
3. 각 bullet은 한 문장으로 간결하게
4. 제목에서 확인할 수 있는 사실만 작성
5. stageTitle에는 단계명을 붙이지 말고 내용만 작성 (예: "녹대 탈출" O, "[발단] 녹대 탈출" X)
6. 각 bullet의 date는 해당 뉴스의 [날짜]를 그대로 사용 (날짜 정보가 없으면 빈 문자열 "")

**브리핑:**
- intro: 이슈를 한 문장으로 (예: "~가 ~해서 논란이야")
- bullets: 핵심 팩트 3~5개
- conclusion: 한 줄 결론 (예: "👉 ~한 상황이야")

JSON 응답:
{
  "summaries": [
    {"stage":"발단","stageTitle":"제목","bullets":[{"date":"4월 25일","text":"사건1"},{"date":"4월 26일","text":"사건2"}]},
    {"stage":"전개","stageTitle":"제목","bullets":[{"date":"4월 26일","text":"후속1"},{"date":"4월 27일","text":"후속2"}]}
  ],
  "brief": {"intro":"한 문장","bullets":["팩트1","팩트2"],"conclusion":"결론"}
}`

    const content = await callGroq(
        [{ role: 'user', content: prompt }],
        { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 2000 },
    )

    const parsed = parseJsonObject<{
        summaries: Array<{ stage: string; stageTitle: string; bullets: Array<{ date: string; text: string } | string> }>
        brief: { intro: string; bullets: string[]; conclusion: string }
    }>(content)

    if (!parsed?.summaries) return 0

    type BulletItem = { date: string; text: string }
    const now = new Date().toISOString()
    const rows = stages.map(stage => {
        const items = grouped.get(stage)!
        const dates = items.map(i => i.occurred_at).sort()
        const ai = parsed.summaries.find(s => s.stage === stage)
        
        const rawBullets: Array<string | BulletItem> = ai?.bullets ?? []
        let bullets: BulletItem[] = rawBullets
            .map((b): BulletItem | null => {
                if (typeof b === 'string') {
                    const text = b.trim()
                    return text ? { date: '', text } : null
                }
                if (b && typeof b === 'object' && typeof b.text === 'string' && b.text.trim()) {
                    return { date: (b.date ?? '').trim(), text: b.text.trim() }
                }
                return null
            })
            .filter((b): b is BulletItem => b !== null)
        
        if (bullets.length > items.length) {
            console.warn(`  ⚠️ [요약 품질 경고] ${issueTitle} - ${stage}: bullets(${bullets.length}개)가 뉴스(${items.length}개)보다 많음`)
        }
        
        const uniqueBullets: BulletItem[] = []
        for (const bullet of bullets) {
            const normalized = bullet.text.toLowerCase().trim()
            const isDuplicate = uniqueBullets.some(existing => {
                const existingNormalized = existing.text.toLowerCase().trim()
                if (normalized === existingNormalized) return true
                const shorter = normalized.length < existingNormalized.length ? normalized : existingNormalized
                const longer = normalized.length >= existingNormalized.length ? normalized : existingNormalized
                return longer.includes(shorter) && shorter.length / longer.length > 0.9
            })
            if (!isDuplicate) uniqueBullets.push(bullet)
        }
        
        if (uniqueBullets.length < bullets.length) {
            console.log(`  ✓ [중복 제거] ${issueTitle} - ${stage}: ${bullets.length}개 → ${uniqueBullets.length}개`)
        }
        
        return {
            issue_id: issueId,
            stage,
            stage_title: ai?.stageTitle ?? stage,
            bullets: uniqueBullets,
            summary: uniqueBullets.map(b => b.text).join(' '),
            date_start: dates[0],
            date_end: dates[dates.length - 1],
            generated_at: now,
        }
    })

    const { error } = await supabaseAdmin
        .from('timeline_summaries')
        .upsert(rows, { onConflict: 'issue_id,stage' })

    if (error) {
        console.warn(`  ⚠️ [요약 저장 실패] ${issueTitle}: ${error.message}`)
        return 0
    }

    // 브리핑 저장
    if (parsed.brief) {
        const { error: briefError } = await supabaseAdmin
            .from('issues')
            .update({ brief_summary: parsed.brief })
            .eq('id', issueId)
        if (briefError) {
            console.warn(`  ⚠️ [브리핑 저장 실패] ${issueTitle}: ${briefError.message}`)
        }
    }

    return rows.length
}

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const force = searchParams.get('force') === 'true'
        const limit = parseInt(searchParams.get('limit') ?? '20', 10)
        const offset = parseInt(searchParams.get('offset') ?? '0', 10)

        let issues: Array<{ id: string; title: string }>

        if (force) {
            // force=true: limit/offset으로 배치 처리
            const { data } = await supabaseAdmin
                .from('issues')
                .select('id, title')
                .in('approval_status', ['승인', '대기'])
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1)
            issues = data ?? []
        } else {
            // force=false: 미생성 이슈만 조회
            const { data } = await supabaseAdmin
                .rpc('get_issues_without_summaries', { limit_count: limit })
            issues = data ?? []
        }

        if (issues.length === 0) {
            return NextResponse.json({ success: true, message: '처리할 이슈 없음', hasMore: false })
        }

        const targets = issues
        console.log(`[generate-timeline-summaries] 대상: ${targets.length}건 offset=${offset} ${force ? '(재생성 모드)' : '(미생성 이슈만)'}`)

        let successCount = 0
        let skippedCount = 0
        let errorCount = 0
        const failedIssues: Array<{ title: string; error: string }> = []

        for (const issue of targets) {
            try {
                const count = await generateSummariesForIssue(issue.id, issue.title)
                if (count > 0) {
                    console.log(`  ✓ ${issue.title}: ${count}개 단계`)
                    successCount++
                } else {
                    skippedCount++
                }
            } catch (error) {
                errorCount++
                const errorMessage = error instanceof Error ? error.message : String(error)
                console.warn(`  ⚠️ [이슈 처리 실패] ${issue.title}: ${errorMessage}`)
                failedIssues.push({ title: issue.title, error: errorMessage })
            }
            await new Promise(resolve => setTimeout(resolve, 800))
        }

        return NextResponse.json({
            success: true,
            processed: successCount,
            skipped: skippedCount,
            errors: errorCount,
            offset,
            limit,
            hasMore: force ? issues.length === limit : false,
            failedIssues: failedIssues.length > 0 ? failedIssues : undefined,
            message: `[offset ${offset}] ${successCount}개 이슈 요약 생성 완료${errorCount > 0 ? `, ${errorCount}개 실패` : ''}`,
        })
    } catch (error) {
        console.error('[generate-timeline-summaries] 에러:', error)
        return NextResponse.json(
            { error: 'MIGRATION_FAILED', message: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        )
    }
}
