/**
 * app/api/admin/shortform/instagram-recent-media/route.ts
 *
 * GET /api/admin/shortform/instagram-recent-media
 *
 * 수동 mediaId 등록 시 선택 UI에 표시할 최근 Instagram 게시물 목록 조회
 * DB 토큰(getInstagramAccessToken)으로 /me/media 호출
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getInstagramAccessToken } from '@/lib/shortform/instagram-token'

export const dynamic = 'force-dynamic'

const GRAPH_API = 'https://graph.instagram.com/v21.0'

export async function GET(_request: NextRequest): Promise<NextResponse> {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const accessToken = await getInstagramAccessToken()
        const fields = 'id,caption,media_type,timestamp,thumbnail_url,media_url,permalink'
        const url = `${GRAPH_API}/me/media?fields=${fields}&limit=18&access_token=${accessToken}`

        const res = await fetch(url)
        const json = await res.json()

        if (!res.ok || json.error) {
            const msg = json.error?.message ?? `HTTP ${res.status}`
            return NextResponse.json(
                { error: 'INSTAGRAM_API_ERROR', message: `Instagram 미디어 조회 실패: ${msg}` },
                { status: 500 }
            )
        }

        return NextResponse.json({ media: json.data ?? [] })
    } catch (error) {
        const msg = error instanceof Error ? error.message : '알 수 없는 오류'
        return NextResponse.json(
            { error: 'INTERNAL_ERROR', message: msg },
            { status: 500 }
        )
    }
}
