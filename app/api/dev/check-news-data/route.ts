/**
 * app/api/dev/check-news-data/route.ts
 * 
 * [개발용 - 뉴스 데이터 확인 API]
 * 
 * 수집된 뉴스 데이터의 개수와 최근 데이터를 확인합니다.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    try {
        // 전체 데이터 가져오기
        const { data: allNews, error, count } = await supabaseAdmin
            .from('news_data')
            .select('id, category, title, source, published_at, created_at', { count: 'exact' })
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Supabase 쿼리 에러:', error)
            throw error
        }

        // 카테고리별 집계
        const byCategory: Record<string, number> = {}
        if (allNews) {
            allNews.forEach((item) => {
                byCategory[item.category] = (byCategory[item.category] || 0) + 1
            })
        }

        // 최근 10개
        const recentNews = allNews?.slice(0, 10) || []

        return NextResponse.json({
            ok: true,
            totalCount: count || 0,
            byCategory,
            recentNews,
        })
    } catch (error) {
        console.error('뉴스 데이터 확인 에러:', error)
        return NextResponse.json(
            { 
                ok: false, 
                error: error instanceof Error ? error.message : String(error) 
            },
            { status: 500 }
        )
    }
}
