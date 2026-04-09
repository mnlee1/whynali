/**
 * app/api/cron/generate-banned-words/route.ts
 * 
 * [Cron - AI 금칙어 자동 생성]
 * 
 * 주 1회 실행하여 최근 삭제/신고된 댓글을 분석하고 새로운 금칙어를 자동 생성
 * 
 * 실행 주기: 매주 월요일 새벽 3시 (추천)
 * Workflow 파일: .github/workflows/cron-generate-banned-words.yml
 * 
 * 프로세스:
 * 1. 최근 7일간 삭제된 댓글 분석
 * 2. 욕설/혐오 사유 신고 댓글 분석
 * 3. 빈도 기반 키워드 추출
 * 4. 기존 금칙어와 중복되지 않는 단어만 선택
 * 5. 빈도 상위 10개를 ai_banned_word로 자동 추가
 * 6. 관리자가 /admin/safety에서 "제외 처리" 또는 "삭제" 가능
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateBannedWords } from '@/lib/ai/banned-word-generator'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const authError = verifyCronRequest(request)
    if (authError) return authError

    try {
        console.log('[Cron] AI 금칙어 자동 생성 시작')
        
        // 최근 7일 데이터 분석, 최대 10개 생성
        const result = await generateBannedWords(7, 10)
        
        if (result.generated.length === 0 && result.skipped.length === 0) {
            return NextResponse.json({
                success: true,
                message: '신규 금칙어 후보 없음 (분석 데이터 부족 또는 모두 중복)',
                generated: [],
                generatedCount: 0,
                timestamp: new Date().toISOString()
            })
        }
        
        if (result.generated.length > 0) {
            console.log(`[Cron] AI 금칙어 ${result.generated.length}개 생성:`, result.generated.join(', '))
        }
        
        if (result.skipped.length > 0) {
            console.log(`[Cron] AI 금칙어 ${result.skipped.length}개 스킵 (저장 실패):`, result.skipped.join(', '))
        }
        
        return NextResponse.json({
            success: true,
            message: result.generated.length > 0 
                ? `AI 금칙어 ${result.generated.length}개 생성 완료`
                : `신규 후보 없음 (스킵 ${result.skipped.length}개)`,
            generated: result.generated,
            generatedCount: result.generated.length,
            skipped: result.skipped,
            skippedCount: result.skipped.length,
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        console.error('[Cron] AI 금칙어 생성 실패:', error)
        return NextResponse.json(
            {
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'AI 금칙어 생성 중 오류 발생'
            },
            { status: 500 }
        )
    }
}
