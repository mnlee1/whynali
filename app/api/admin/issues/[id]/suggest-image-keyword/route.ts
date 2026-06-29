/**
 * app/api/admin/issues/[id]/suggest-image-keyword/route.ts
 *
 * 이슈 제목·카테고리 기반으로 Pexels 검색 키워드를 AI가 추천합니다.
 * 이미지 검색은 하지 않고 키워드만 반환합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { extractKeywordsAndTone } from '@/lib/pexels'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params
    // retry=true이면 temperature를 높여 다른 키워드 추천
    const isRetry = request.nextUrl.searchParams.get('retry') === 'true'
    const exclude = request.nextUrl.searchParams.get('exclude') ?? ''

    const { data: issue, error } = await supabaseAdmin
        .from('issues')
        .select('title, category')
        .eq('id', id)
        .single()

    if (error || !issue) {
        return NextResponse.json({ error: '이슈를 찾을 수 없습니다' }, { status: 404 })
    }

    const result = await extractKeywordsAndTone(issue.title, issue.category, isRetry ? 0.8 : 0, exclude)

    return NextResponse.json({
        keyword: result?.keywords ?? '',
        isDark: result?.isDark ?? false,
    })
}
