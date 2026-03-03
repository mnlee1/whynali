/**
 * app/api/dev/revalidate-all-issues/route.ts
 * 
 * 기존 이슈들을 현재 기준으로 재평가
 * 
 * 모든 이슈(승인/대기/반려)의 화력을 재계산하고
 * MIN_HEAT_TO_REGISTER 기준으로 다시 필터링합니다.
 * 
 * 사용법: GET http://localhost:3000/api/dev/revalidate-all-issues
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { recalculateHeatForIssue } from '@/lib/analysis/heat'
import { NextResponse } from 'next/server'

const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '30')

export async function GET() {
    try {
        console.log('='.repeat(60))
        console.log('기존 이슈 재평가 시작')
        console.log(`화력 기준: ${MIN_HEAT_TO_REGISTER}점`)
        console.log('='.repeat(60))

        // 모든 이슈 조회 (반려 포함)
        const { data: allIssues, error } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, heat_index, created_at')
            .order('created_at', { ascending: false })

        if (error) throw error
        if (!allIssues || allIssues.length === 0) {
            return NextResponse.json({
                success: true,
                message: '재평가할 이슈가 없습니다',
            })
        }

        console.log(`\n총 ${allIssues.length}개 이슈 재평가 중...`)

        const results: Array<{
            id: string
            title: string
            oldStatus: string
            oldHeat: number | null
            newHeat: number
            action: string
        }> = []

        let deleted = 0
        let kept = 0

        for (const issue of allIssues) {
            try {
                // 화력 재계산
                const newHeat = await recalculateHeatForIssue(issue.id)

                const result: (typeof results)[number] = {
                    id: issue.id,
                    title: issue.title,
                    oldStatus: issue.approval_status,
                    oldHeat: issue.heat_index,
                    newHeat,
                    action: '',
                }

                // 화력 부족 시 삭제
                if (newHeat < MIN_HEAT_TO_REGISTER) {
                    await supabaseAdmin
                        .from('issues')
                        .delete()
                        .eq('id', issue.id)

                    result.action = `삭제 (화력 ${newHeat} < ${MIN_HEAT_TO_REGISTER})`
                    deleted++
                    console.log(`❌ [삭제] "${issue.title}" (${issue.approval_status}) - 화력: ${issue.heat_index || '?'} → ${newHeat}점`)
                } else {
                    result.action = `유지 (화력 ${newHeat} >= ${MIN_HEAT_TO_REGISTER})`
                    kept++
                    
                    // 화력이 크게 변경된 경우만 로그
                    const diff = Math.abs(newHeat - (issue.heat_index || 0))
                    if (diff >= 10) {
                        console.log(`✓ [유지] "${issue.title}" (${issue.approval_status}) - 화력: ${issue.heat_index || '?'} → ${newHeat}점`)
                    }
                }

                results.push(result)
            } catch (err) {
                console.error(`이슈 ${issue.id} 재평가 실패:`, err)
            }
        }

        console.log('\n' + '='.repeat(60))
        console.log('재평가 완료')
        console.log('='.repeat(60))
        console.log(`총 처리: ${allIssues.length}개`)
        console.log(`✓ 유지: ${kept}개`)
        console.log(`❌ 삭제: ${deleted}개`)
        console.log('='.repeat(60))

        return NextResponse.json({
            success: true,
            summary: {
                total: allIssues.length,
                kept,
                deleted,
                minHeat: MIN_HEAT_TO_REGISTER,
            },
            details: results.slice(0, 20), // 최대 20개만 반환
            message: `${allIssues.length}개 이슈 재평가 완료 (유지: ${kept}, 삭제: ${deleted})`,
        })
    } catch (error) {
        console.error('이슈 재평가 실패:', error)
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : '알 수 없는 오류',
            },
            { status: 500 }
        )
    }
}
