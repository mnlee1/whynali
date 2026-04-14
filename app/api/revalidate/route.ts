/**
 * app/api/revalidate/route.ts
 *
 * [캐시 무효화 API]
 *
 * ISR 캐시를 수동으로 즉시 무효화합니다.
 * 
 * 사용법:
 * curl https://whynali.com/api/revalidate?secret=YOUR_SECRET&path=/
 * 
 * 또는 브라우저에서:
 * https://whynali.com/api/revalidate?secret=YOUR_SECRET&path=/
 */

import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const secret = searchParams.get('secret')
    const path = searchParams.get('path') || '/'

    // 보안: REVALIDATE_SECRET 환경 변수와 일치해야 함
    if (secret !== process.env.REVALIDATE_SECRET) {
        return NextResponse.json(
            { error: 'Invalid secret' },
            { status: 401 }
        )
    }

    try {
        // 지정된 경로의 캐시 무효화
        revalidatePath(path, 'page')
        
        return NextResponse.json({
            revalidated: true,
            path,
            now: Date.now()
        })
    } catch (error) {
        return NextResponse.json(
            { error: 'Error revalidating' },
            { status: 500 }
        )
    }
}
