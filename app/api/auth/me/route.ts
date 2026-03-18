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
        .select('display_name')
        .eq('id', user.id)
        .limit(1)

    return NextResponse.json({
        id: user.id,
        email: user.email,
        provider: user.app_metadata?.provider ?? null,
        displayName: rows?.[0]?.display_name ?? null,
    })
}
