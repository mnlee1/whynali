/**
 * app/api/admin/issues/[id]/merge/route.ts
 *
 * [관리자 - 이슈 병합 API]
 *
 * POST body: { target_id: string }
 *
 * [id] = 소스 이슈 (병합 후 '병합됨' 처리)
 * target_id = 타깃 이슈 (데이터 수신, 유지됨)
 *
 * 처리 순서:
 *  1. news_data, community_data, comments, timeline_points → target으로 이동
 *  2. reactions: UNIQUE(issue_id, user_id) 충돌 방지 후 이동
 *  3. votes, vote_choices: 단순 이동 (target에 이미 있으면 소스 votes는 삭제)
 *  4. 소스 이슈 → approval_status='병합됨', merged_into_id=target_id
 *  5. 캐시 무효화
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'
import { generateCloseSummary } from '@/lib/ai/generate-close-summary'
import { generateAndCacheSummaries } from '@/lib/ai/generate-timeline-summary'

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id: sourceId } = await params

    let body: { target_id?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            { error: 'INVALID_BODY', message: '요청 본문이 올바르지 않습니다.' },
            { status: 400 }
        )
    }

    const targetId = body.target_id
    if (!targetId || typeof targetId !== 'string') {
        return NextResponse.json(
            { error: 'MISSING_TARGET', message: 'target_id가 필요합니다.' },
            { status: 400 }
        )
    }

    if (sourceId === targetId) {
        return NextResponse.json(
            { error: 'SAME_ISSUE', message: '소스와 타깃이 동일합니다.' },
            { status: 400 }
        )
    }

    try {
        // 소스·타깃 이슈 존재 확인
        const { data: sourceIssue, error: srcErr } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status')
            .eq('id', sourceId)
            .single()
        if (srcErr || !sourceIssue) {
            return NextResponse.json(
                { error: 'SOURCE_NOT_FOUND', message: '소스 이슈를 찾을 수 없습니다.' },
                { status: 404 }
            )
        }
        if (sourceIssue.approval_status === '병합됨') {
            return NextResponse.json(
                { error: 'ALREADY_MERGED', message: '이미 병합된 이슈입니다.' },
                { status: 409 }
            )
        }

        const { data: targetIssue, error: tgtErr } = await supabaseAdmin
            .from('issues')
            .select('id, title, status, topic_description')
            .eq('id', targetId)
            .single()
        if (tgtErr || !targetIssue) {
            return NextResponse.json(
                { error: 'TARGET_NOT_FOUND', message: '타깃 이슈를 찾을 수 없습니다.' },
                { status: 404 }
            )
        }

        // 1. news_data
        await supabaseAdmin.from('news_data').update({ issue_id: targetId }).eq('issue_id', sourceId)

        // 2. community_data
        await supabaseAdmin.from('community_data').update({ issue_id: targetId }).eq('issue_id', sourceId)

        // 3. comments
        await supabaseAdmin.from('comments').update({ issue_id: targetId }).eq('issue_id', sourceId)

        // 4. timeline_points
        await supabaseAdmin.from('timeline_points').update({ issue_id: targetId }).eq('issue_id', sourceId)

        // 5. reactions — UNIQUE(issue_id, user_id) 충돌 방지
        //    타깃에 이미 같은 user_id 반응이 있으면 소스 반응 삭제 후 나머지 이동
        const { data: targetReactions } = await supabaseAdmin
            .from('reactions')
            .select('user_id')
            .eq('issue_id', targetId)

        if (targetReactions && targetReactions.length > 0) {
            const conflictUserIds = targetReactions.map(r => r.user_id)
            // 충돌하는 소스 반응 삭제
            await supabaseAdmin
                .from('reactions')
                .delete()
                .eq('issue_id', sourceId)
                .in('user_id', conflictUserIds)
        }
        // 남은 소스 반응 이동
        await supabaseAdmin
            .from('reactions')
            .update({ issue_id: targetId })
            .eq('issue_id', sourceId)

        // 6. votes — 소스 votes를 타깃으로 이동 (vote_choices는 vote_id 기반이라 그대로 유지)
        await supabaseAdmin.from('votes').update({ issue_id: targetId }).eq('issue_id', sourceId)

        // 6-1. discussion_topics — 소스 이슈의 토론을 타깃으로 이동
        await supabaseAdmin.from('discussion_topics').update({ issue_id: targetId }).eq('issue_id', sourceId)

        // 6-2. shortform_jobs — issue_id 및 issue_title 스냅샷 동기화
        await supabaseAdmin
            .from('shortform_jobs')
            .update({ issue_id: targetId, issue_title: targetIssue.title })
            .eq('issue_id', sourceId)

        // 7. 타임라인 요약 정리
        // 소스 요약 삭제 (소스 이슈가 사라지므로 불필요)
        await supabaseAdmin.from('timeline_summaries').delete().eq('issue_id', sourceId)
        // 타깃이 종결 상태이면 종결 요약 삭제:
        // 소스 데이터가 합산되어 화력이 오를 수 있고, 타임라인도 바뀌므로 기존 요약은 무효
        if (targetIssue.status === '종결') {
            await supabaseAdmin
                .from('timeline_summaries')
                .delete()
                .eq('issue_id', targetId)
                .eq('stage', '종결')
        }

        // 8. 소스 이슈 병합됨 처리
        await supabaseAdmin
            .from('issues')
            .update({
                approval_status: '병합됨',
                merged_into_id: targetId,
            })
            .eq('id', sourceId)

        await writeAdminLog(
            '이슈 병합',
            'issue',
            sourceId,
            auth.adminEmail,
            `"${sourceIssue.title}" → "${targetIssue.title}" (target: ${targetId})`
        )

        revalidatePath('/')
        revalidatePath(`/issue/${sourceId}`)
        revalidatePath(`/issue/${targetId}`)

        // 응답 후 백그라운드에서 타임라인 요약 즉시 재생성
        // 종결 요약 + 단계별 요약(발단/전개/파생) 모두 갱신
        // 종결 이슈도 단계별 요약은 항상 갱신 필요 (소스 포인트가 추가됐으므로)
        after(async () => {
            try {
                if (targetIssue.status === '종결') {
                    await generateCloseSummary(targetIssue.id, targetIssue.title, true)
                }
                await generateAndCacheSummaries(targetIssue.id, targetIssue.title, targetIssue.topic_description)
            } catch (e) {
                console.error(`[병합 후 타임라인 재생성 실패] ${targetIssue.title}:`, e)
            }
        })

        return NextResponse.json({
            success: true,
            source: { id: sourceId, title: sourceIssue.title },
            target: { id: targetId, title: targetIssue.title },
        })
    } catch (error) {
        console.error('이슈 병합 에러:', error)
        return NextResponse.json(
            { error: 'MERGE_ERROR', message: '이슈 병합 실패' },
            { status: 500 }
        )
    }
}
