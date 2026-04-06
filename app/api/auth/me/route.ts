import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/admin'

export async function GET() {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const adminClient = createSupabaseAdminClient()
    const { data: rows } = await adminClient
        .from('users')
        .select('display_name, terms_agreed_at')
        .eq('id', user.id)
        .limit(1)

    const displayName = rows?.[0]?.display_name ?? null

    // 관리자 계정은 OAuth 실명 감지 로직 적용하지 않음.
    // Supabase 계정 생성 시 user_metadata.full_name 에 직접 설정한 이름이므로
    // OAuth 실명과 같다는 이유로 null 처리하면 안 됨.
    const isAdmin = isAdminUser(user)

    const oauthName = isAdmin ? null : (
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        null
    )
    const displayNameNeedsReset = Boolean(oauthName && displayName && displayName === oauthName)

    return NextResponse.json({
        id: user.id,
        email: user.email,
        provider: user.app_metadata?.provider ?? null,
        displayName: displayNameNeedsReset ? null : displayName,
        termsAgreedAt: rows?.[0]?.terms_agreed_at ?? null,
        displayNameNeedsReset,
    })
}

/* auth/verify 에서 OAuth 실명 감지 시 display_name 초기화용 */
export async function PATCH() {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
        return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const adminClient = createSupabaseAdminClient()
    await adminClient.from('users').update({ display_name: null }).eq('id', user.id)

    return NextResponse.json({ success: true })
}
