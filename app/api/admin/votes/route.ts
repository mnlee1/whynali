import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { sanitizeText } from '@/lib/safety'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

/* POST /api/admin/votes — 투표 생성 (선택지 동시 생성)
   body: { issue_id, title?, choices: string[] } */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { issue_id, title, choices } = body

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

        const { data: vote, error: voteError } = await supabaseAdmin
            .from('votes')
            .insert({
                issue_id,
                title: title ? sanitizeText(title) : null,
                phase: '진행중',
            })
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
