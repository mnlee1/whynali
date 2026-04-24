/**
 * app/api/admin/issues/[id]/route.ts
 *
 * [관리자 - 이슈 수정·삭제 API]
 *
 * PATCH : 이슈 제목·카테고리 등 기본 필드 수정
 * DELETE: 이슈 영구 삭제 (CASCADE로 연결 데이터 자동 정리)
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params
        const body = await request.json()

        const allowed = ['title', 'category', 'status', 'topic', 'topic_description']
        const updates: Record<string, unknown> = {}

        for (const key of allowed) {
            if (key in body) {
                updates[key] = body[key]
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: 'NO_FIELDS', message: '수정할 필드가 없습니다.' },
                { status: 400 }
            )
        }

        const { data, error } = await supabaseAdmin
            .from('issues')
            .update(updates)
            .eq('id', id)
            .select('id, title, category, status')
            .single()

        if (error) throw error

        await writeAdminLog(
            `이슈 수정: ${Object.keys(updates).join(', ')}`,
            'issue',
            id,
            auth.adminEmail,
            `"${data.title}"`
        )

        revalidatePath('/')
        revalidatePath(`/issue/${id}`)

        return NextResponse.json({ data })
    } catch (error) {
        console.error('이슈 수정 에러:', error)
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message: '이슈 수정 실패' },
            { status: 500 }
        )
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        const { data: issue, error: fetchError } = await supabaseAdmin
            .from('issues')
            .select('id, title')
            .eq('id', id)
            .single()

        if (fetchError || !issue) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '이슈를 찾을 수 없습니다.' },
                { status: 404 }
            )
        }

        const { error } = await supabaseAdmin
            .from('issues')
            .delete()
            .eq('id', id)

        if (error) throw error

        await writeAdminLog(
            '이슈 삭제',
            'issue',
            id,
            auth.adminEmail,
            `"${issue.title}"`
        )

        revalidatePath('/')

        return NextResponse.json({ success: true, id })
    } catch (error) {
        console.error('이슈 삭제 에러:', error)
        return NextResponse.json(
            { error: 'DELETE_ERROR', message: '이슈 삭제 실패' },
            { status: 500 }
        )
    }
}
