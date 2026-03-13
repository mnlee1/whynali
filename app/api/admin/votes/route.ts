import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { sanitizeText } from '@/lib/safety'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

/* GET /api/admin/votes — 투표 목록 조회 (관리자)
   query: phase?, approval_status?, limit? */
export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { searchParams } = request.nextUrl
        const phase = searchParams.get('phase')
        const approvalStatus = searchParams.get('approval_status')
        const limit = parseInt(searchParams.get('limit') ?? '20', 10)
        const offset = parseInt(searchParams.get('offset') ?? '0', 10)

        let query = supabaseAdmin
            .from('votes')
            .select('id, issue_id, title, phase, approval_status, issue_status_snapshot, started_at, ended_at, auto_end_date, auto_end_participants, created_at, issues(id, title), vote_choices(id, label, count)')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (phase && ['대기', '진행중', '마감'].includes(phase)) {
            query = query.eq('phase', phase)
        }

        if (approvalStatus) {
            const statuses = approvalStatus.split(',')
            if (statuses.length === 1) {
                query = query.eq('approval_status', statuses[0])
            } else {
                query = query.in('approval_status', statuses)
            }
        }

        const { data, error } = await query

        if (error) {
            console.error('[투표 조회 에러]', error)
            throw error
        }

        /* 페이지네이션용 전체 카운트 — 항상 별도 쿼리로 조회 */
        let countQuery = supabaseAdmin
            .from('votes')
            .select('id', { count: 'exact', head: true })

        if (phase && ['대기', '진행중', '마감'].includes(phase)) {
            countQuery = countQuery.eq('phase', phase)
        }

        if (approvalStatus) {
            const statuses = approvalStatus.split(',')
            if (statuses.length === 1) {
                countQuery = countQuery.eq('approval_status', statuses[0])
            } else {
                countQuery = countQuery.in('approval_status', statuses)
            }
        }

        const { count: totalCount } = await countQuery

        return NextResponse.json({ data: data ?? [], total: totalCount ?? 0 })
    } catch (e) {
        console.error('[투표 조회 API 에러]', e)
        const message = e instanceof Error ? e.message : '투표 조회 실패'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

/* POST /api/admin/votes — 투표 생성 (선택지 동시 생성)
   body: { issue_id, title?, choices: string[], auto_end_date?, auto_end_participants? } */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { issue_id, title, choices, auto_end_date, auto_end_participants, is_ai_generated = false } = body

        if (!issue_id) {
            return NextResponse.json({ error: 'issue_id가 필요합니다.' }, { status: 400 })
        }
        if (!Array.isArray(choices) || choices.length < 2) {
            return NextResponse.json({ error: '선택지는 2개 이상이어야 합니다.' }, { status: 400 })
        }
        if (choices.length > 6) {
            return NextResponse.json({ error: '선택지는 최대 6개까지 가능합니다.' }, { status: 400 })
        }

        const sanitizedChoices = (choices as string[]).map((c) => sanitizeText(c))
        const hasInvalidChoice = sanitizedChoices.some((c) => !c || c.length > 50)
        if (hasInvalidChoice) {
            return NextResponse.json({ error: '선택지는 1~50자여야 합니다.' }, { status: 400 })
        }

        const { data: issue, error: issueError } = await supabaseAdmin
            .from('issues')
            .select('status')
            .eq('id', issue_id)
            .single()

        if (issueError) {
            return NextResponse.json({ error: '이슈를 찾을 수 없습니다.' }, { status: 404 })
        }

        // 자동 종료 옵션 준비
        const voteData: any = {
            issue_id,
            title: title ? sanitizeText(title) : null,
            phase: '대기',
            issue_status_snapshot: issue?.status,
            is_ai_generated: Boolean(is_ai_generated),
        }

        if (auto_end_date) {
            voteData.auto_end_date = auto_end_date
        }
        if (auto_end_participants && typeof auto_end_participants === 'number') {
            voteData.auto_end_participants = auto_end_participants
        }

        const { data: vote, error: voteError } = await supabaseAdmin
            .from('votes')
            .insert(voteData)
            .select()
            .single()

        if (voteError) throw voteError

        const choiceRows = sanitizedChoices.map((label) => ({
            vote_id: vote.id,
            label,
            count: 0,
        }))

        const { data: voteChoices, error: choicesError } = await supabaseAdmin
            .from('vote_choices')
            .insert(choiceRows)
            .select()

        if (choicesError) {
            /* 선택지 삽입 실패 시 투표도 롤백 */
            await supabaseAdmin.from('votes').delete().eq('id', vote.id)
            throw choicesError
        }

        await writeAdminLog('투표 생성', 'vote', vote.id, auth.adminEmail)
        return NextResponse.json({ data: { ...vote, vote_choices: voteChoices } }, { status: 201 })
    } catch {
        return NextResponse.json({ error: '투표 생성 실패' }, { status: 500 })
    }
}
