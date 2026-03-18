/**
 * lib/shortform/background-trigger.ts
 * 
 * 숏폼 job 생성 백그라운드 트리거 헬퍼
 * 
 * fire-and-forget 패턴으로 숏폼 job 생성을 요청합니다.
 * 실패해도 메인 작업(이슈 승인, 상태 전환)에 영향을 주지 않습니다.
 * 
 * 화력 필터링:
 * - 화력 30점 이상만 숏폼 job 생성 (환경변수로 조정 가능)
 * - 외부 유입 효과가 낮은 저화력 이슈는 제외
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { createShortformJob } from './create-job'
import type { ShortformTriggerType } from '@/types/shortform'

const SHORTFORM_MIN_HEAT = parseInt(process.env.SHORTFORM_MIN_HEAT ?? '30')

/**
 * 숏폼 job 생성 백그라운드 실행
 * 
 * 화력 필터링: 화력이 SHORTFORM_MIN_HEAT(기본 30점) 이상인 이슈만 생성합니다.
 * 
 * @param issueId - 이슈 ID
 * @param triggerType - 트리거 타입
 * @param context - 에러 로그용 컨텍스트 (예: '[approve]', '[cron]')
 */
export async function createShortformJobInBackground(
    issueId: string,
    triggerType: ShortformTriggerType,
    context: string = '[shortform]'
): Promise<void> {
    try {
        // 이슈 화력 확인
        const { data: issue, error: issueError } = await supabaseAdmin
            .from('issues')
            .select('heat_index')
            .eq('id', issueId)
            .single()

        if (issueError || !issue) {
            console.error(`${context} 이슈 조회 실패: ${issueId}`)
            return
        }

        const heatIndex = issue.heat_index ?? 0

        // 화력 30점 미만이면 생성 스킵
        if (heatIndex < SHORTFORM_MIN_HEAT) {
            console.log(`${context} 숏폼 job 생성 스킵: 화력 부족 (${heatIndex}점 < ${SHORTFORM_MIN_HEAT}점)`)
            return
        }

        // 숏폼 job 생성
        const jobId = await createShortformJob({ issueId, triggerType })
        console.log(`${context} 숏폼 job 생성 성공: ${jobId} (이슈: ${issueId}, 화력: ${heatIndex}점, 트리거: ${triggerType})`)
    } catch (error) {
        console.error(`${context} 숏폼 job 생성 실패 (메인 작업은 정상 완료):`, error)
    }
}
