/**
 * app/api/admin/shortform/image-proxy/route.ts
 *
 * Pixabay 이미지를 서버 사이드에서 가져와 브라우저에 전달.
 * largeImageURL은 브라우저 직접 접근이 불안정하므로 프록시 처리.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const url = request.nextUrl.searchParams.get('url')
    if (!url) {
        return new NextResponse('Missing url parameter', { status: 400 })
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://pixabay.com/',
                'Accept': 'image/webp,image/jpeg,image/*,*/*;q=0.8',
            },
            redirect: 'follow',
        })

        if (!response.ok) {
            return new NextResponse('Image fetch failed', { status: 502 })
        }

        const contentType = response.headers.get('Content-Type') || ''
        if (!contentType.startsWith('image/')) {
            // 이미지가 아닌 응답(HTML 로그인 페이지 등) 반환 시 차단
            return new NextResponse('Not an image', { status: 502 })
        }

        const buffer = Buffer.from(await response.arrayBuffer())

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
            },
        })
    } catch {
        return new NextResponse('Image proxy error', { status: 502 })
    }
}
