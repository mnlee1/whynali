/** app/api/auth/is-admin/route.ts — 현재 사용자의 관리자 여부 반환 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    return NextResponse.json({ isAdmin: isAdminEmail(user?.email) })
}
