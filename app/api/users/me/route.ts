/**
 * app/api/users/me/route.ts
 *
 * PATCH: 마케팅 수신 동의 변경
 * DELETE: 회원 탈퇴 (users 삭제 → CASCADE, auth 계정 삭제)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'

export async function PATCH(request: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { marketingAgreed } = body

    if (typeof marketingAgreed !== 'boolean') {
        return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()
    const { error: updateError } = await admin
        .from('users')
        .update({ marketing_agreed: marketingAgreed })
        .eq('id', user.id)

    if (updateError) {
        console.error('[PATCH /api/users/me]', updateError)
        return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}

export async function DELETE() {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()

    // users 삭제 → ON DELETE CASCADE로 reactions, comments, user_votes 자동 삭제
    const { error: deleteError } = await admin
        .from('users')
        .delete()
        .eq('id', user.id)

    if (deleteError) {
        console.error('[DELETE /api/users/me] users 삭제 오류:', deleteError)
        return NextResponse.json({ error: '탈퇴 처리에 실패했습니다.' }, { status: 500 })
    }

    // Supabase auth 계정 삭제
    const { error: authError } = await admin.auth.admin.deleteUser(user.id)
    if (authError) {
        // users는 이미 삭제됐으므로 로그만 남기고 성공 처리
        console.error('[DELETE /api/users/me] auth 삭제 오류:', authError)
    }

    return NextResponse.json({ success: true })
}
