import { NextRequest, NextResponse } from 'next/server'
import { collectNaverNews } from '@/lib/collectors/naver-news'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const categories = ['연예', '스포츠', '정치', '사회', '기술']
        const results = await Promise.all(
            categories.map((cat) => collectNaverNews(cat))
        )

        const totalCollected = results.reduce((sum, count) => sum + count, 0)

        return NextResponse.json({
            success: true,
            collected: totalCollected,
            byCategory: categories.reduce<Record<string, number>>((acc, cat, i) => {
                acc[cat] = results[i]
                return acc
            }, {}),
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('뉴스 수집 Cron 에러:', error)
        return NextResponse.json(
            { error: 'COLLECTION_ERROR', message: '뉴스 수집 실패' },
            { status: 500 }
        )
    }
}
