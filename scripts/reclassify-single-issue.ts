/**
 * scripts/reclassify-single-issue.ts
 * 
 * 특정 이슈 하나만 AI로 재분류하는 스크립트
 * 
 * 실행:
 * npx tsx scripts/reclassify-single-issue.ts <issue_id>
 * 
 * 예시:
 * npx tsx scripts/reclassify-single-issue.ts 123e4567-e89b-12d3-a456-426614174000
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'
import { classifyCategoryByAI } from '../lib/candidate/category-classifier'

async function reclassifySingleIssue(issueId: string) {
    // AI 분류 강제 활성화
    process.env.ENABLE_AI_CATEGORY = 'true'

    console.log('=== 이슈 재분류 ===\n')
    console.log(`이슈 ID: ${issueId}\n`)

    // 1. 이슈 조회
    const { data: issue, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, heat_index, approval_status')
        .eq('id', issueId)
        .single()

    if (error || !issue) {
        console.error('이슈를 찾을 수 없습니다:', error)
        return
    }

    console.log(`제목: ${issue.title}`)
    console.log(`현재 카테고리: ${issue.category}`)
    console.log(`화력: ${issue.heat_index ?? 'null'}점`)
    console.log(`승인 상태: ${issue.approval_status}\n`)

    // 2. 연결된 뉴스 확인
    const { data: news } = await supabaseAdmin
        .from('news_data')
        .select('id, title, category')
        .eq('issue_id', issueId)
        .limit(5)

    if (news && news.length > 0) {
        console.log('연결된 뉴스 샘플:')
        news.forEach((n, idx) => {
            console.log(`  ${idx + 1}. [${n.category ?? '미분류'}] ${n.title.substring(0, 60)}...`)
        })
        console.log('')
    }

    // 3. AI 재분류
    console.log('AI 재분류 중...\n')
    
    try {
        const result = await classifyCategoryByAI([issue.title])

        console.log(`AI 분류 결과: ${result.category}`)
        console.log(`신뢰도: ${result.confidence}%`)
        console.log(`이유: ${result.reason}\n`)

        if (result.category !== issue.category) {
            if (result.confidence >= 70) {
                console.log(`변경: ${issue.category} → ${result.category}`)
                
                // 4. 카테고리 업데이트
                const { error: updateError } = await supabaseAdmin
                    .from('issues')
                    .update({ category: result.category })
                    .eq('id', issueId)

                if (updateError) {
                    console.error('❌ 업데이트 에러:', updateError)
                } else {
                    console.log('✅ 카테고리가 성공적으로 변경되었습니다.')
                    
                    // 5. 연결된 뉴스 재검증 필요 알림
                    console.log('\n⚠️  다음 단계:')
                    console.log('  카테고리가 변경되었으므로 연결된 뉴스를 재검증해야 합니다.')
                    console.log('  cron 작업(auto-link)이 자동으로 처리하거나,')
                    console.log('  수동으로 재연결: npx tsx scripts/rematch-community.ts')
                }
            } else {
                console.log(`⚠️  신뢰도가 낮아(${result.confidence}%) 변경하지 않습니다.`)
            }
        } else {
            console.log('ℹ️  카테고리가 이미 올바르게 설정되어 있습니다.')
        }

    } catch (error) {
        console.error('❌ AI 분류 에러:', error)
    }
}

// CLI 인자 파싱
const issueId = process.argv[2]

if (!issueId) {
    console.error('사용법: npx tsx scripts/reclassify-single-issue.ts <issue_id>')
    process.exit(1)
}

reclassifySingleIssue(issueId).catch(console.error)
