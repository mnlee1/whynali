import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'

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

    // 구 트리거가 OAuth 실명을 display_name에 저장했는지 감지
    // user_metadata.name 또는 full_name과 일치하면 사용자가 직접 설정한 닉네임이 아님
    const oauthName = (
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
