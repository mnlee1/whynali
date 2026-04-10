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

    return NextResponse.json({
        id: user.id,
        email: user.email,
        provider: user.app_metadata?.provider ?? null,
        displayName: displayName,
        termsAgreedAt: rows?.[0]?.terms_agreed_at ?? null,
    })
}

/* PATCH 메서드는 더 이상 사용되지 않음 (OAuth 실명 감지 로직 제거됨) */
