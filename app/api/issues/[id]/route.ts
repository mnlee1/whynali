import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    // TODO: Supabase에서 이슈 상세 조회

    return NextResponse.json({
        id,
        title: '',
        description: '',
        status: '',
        category: '',
        heat_index: 0,
        created_at: '',
    })
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { data, error } = await supabaseAdmin
            .from('issues')
            .select('*')
            .eq('id', id)
            .single()

        if (error) throw error
        if (!data) {
            return NextResponse.json(
                { error: 'NOT_FOUND', message: '이슈를 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        return NextResponse.json({ data })
    } catch (error) {
        console.error('Issue fetch error:', error)
        return NextResponse.json(
            { error: 'FETCH_ERROR', message: '이슈 조회 실패' },
            { status: 500 }
        )
    }
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const body = await request.json()
        const allowed = ['title', 'description', 'status', 'category', 'heat_index', 'approval_status', 'approved_at']
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

        for (const key of allowed) {
            if (key in body) {
                updates[key] = body[key]
            }
        }

        const { data, error } = await supabaseAdmin
            .from('issues')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ data })
    } catch (error) {
        console.error('Issue update error:', error)
        return NextResponse.json(
            { error: 'UPDATE_ERROR', message: '이슈 수정 실패' },
            { status: 500 }
        )
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params

    try {
        const { error } = await supabaseAdmin
            .from('issues')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Issue delete error:', error)
        return NextResponse.json(
            { error: 'DELETE_ERROR', message: '이슈 삭제 실패' },
            { status: 500 }
        )
    }
}
