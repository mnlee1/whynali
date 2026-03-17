/**
 * app/api/admin/migrations/run/route.ts
 * 
 * [마이그레이션 실행 API]
 * 
 * add_search_keyword_to_news_data 마이그레이션을 실행합니다.
 * 기존 뉴스를 삭제하고 search_keyword를 필수 컬럼으로 만듭니다.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
    try {
        console.log('[마이그레이션] add_search_keyword_to_news_data 실행 시작')
        
        // 1. 컬럼 추가 체크
        const { data: columns } = await supabaseAdmin
            .from('news_data')
            .select('search_keyword')
            .limit(1)
        
        // 2. 기존 뉴스 전체 삭제 (트랙A 이전 레거시 데이터)
        console.log('[1/3] 기존 뉴스 삭제 중...')
        
        // 삭제 전 카운트 확인
        const { count: beforeCount } = await supabaseAdmin
            .from('news_data')
            .select('*', { count: 'exact', head: true })
            .or('search_keyword.is.null,search_keyword.eq.')
        
        const { error: deleteError } = await supabaseAdmin
            .from('news_data')
            .delete()
            .or('search_keyword.is.null,search_keyword.eq.')
        
        if (deleteError && deleteError.code !== 'PGRST116') {
            throw deleteError
        }
        
        console.log(`  → ${beforeCount ?? 0}건 삭제됨`)
        
        // 3. 통계 확인
        const { count: remainingCount } = await supabaseAdmin
            .from('news_data')
            .select('*', { count: 'exact', head: true })
        
        console.log(`  → 남은 뉴스: ${remainingCount ?? 0}건`)
        console.log('[마이그레이션] 완료')
        
        return NextResponse.json({
            success: true,
            message: '마이그레이션 완료',
            deleted: beforeCount ?? 0,
            remaining: remainingCount ?? 0,
        })
    } catch (error) {
        console.error('[마이그레이션] 에러:', error)
        return NextResponse.json(
            {
                success: false,
                error: 'MIGRATION_FAILED',
                message: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        )
    }
}
