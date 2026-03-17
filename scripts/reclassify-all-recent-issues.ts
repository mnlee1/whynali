/**
 * scripts/reclassify-all-recent-issues.ts
 * 
 * 최근 이슈들을 AI로 일괄 재분류
 * Rate Limit 고려하여 안전하게 처리
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

// AI 강제 활성화
process.env.ENABLE_AI_CATEGORY = 'true'
process.env.CATEGORY_STRATEGY = 'ai'

import { supabaseAdmin } from '../lib/supabase/server'
import { classifyCategoryByAI } from '../lib/candidate/category-classifier'
import type { IssueCategory } from '@/lib/config/categories'

interface ReclassifyOptions {
    dryRun?: boolean
    days?: number
    categories?: string[]
    delay?: number
}

async function reclassifyRecentIssues(options: ReclassifyOptions = {}) {
    const {
        dryRun = true,  // 기본값: dry-run
        days = 7,
        categories = [],
        delay = 3000,  // Rate Limit 방지: 3초 대기
    } = options

    console.log('=== 최근 이슈 일괄 재분류 ===\n')
    console.log(`모드: ${dryRun ? 'DRY RUN (실제 업데이트 안 함)' : '실제 업데이트'}`)
    console.log(`대상: 최근 ${days}일 이슈`)
    if (categories.length > 0) {
        console.log(`카테고리 필터: ${categories.join(', ')}`)
    }
    console.log(`API 대기 시간: ${delay}ms\n`)

    // 1. 대상 이슈 조회
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    
    let query = supabaseAdmin
        .from('issues')
        .select('id, title, category, heat_index, approval_status, created_at')
        .gte('created_at', sinceDate)
        .order('created_at', { ascending: false })

    if (categories.length > 0) {
        query = query.in('category', categories)
    }

    const { data: issues, error } = await query

    if (error) {
        console.error('이슈 조회 에러:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('재분류할 이슈가 없습니다.')
        return
    }

    console.log(`총 ${issues.length}개 이슈 발견\n`)
    
    // 예상 소요 시간 계산
    const estimatedTime = Math.ceil((issues.length * delay) / 1000 / 60)
    console.log(`⏱️  예상 소요 시간: 약 ${estimatedTime}분\n`)

    // 2. 각 이슈별로 재분류
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const changes: Array<{title: string, before: string, after: string, confidence: number}> = []

    for (let i = 0; i < issues.length; i++) {
        const issue = issues[i]
        const progress = `[${i + 1}/${issues.length}]`

        console.log(`\n${progress} "${issue.title.substring(0, 50)}..."`)
        console.log(`  현재: ${issue.category} | 화력: ${issue.heat_index}점 | ${issue.approval_status}`)

        try {
            // AI 재분류
            const result = await classifyCategoryByAI([issue.title])

            console.log(`  AI: ${result.category} (신뢰도: ${result.confidence}%)`)
            console.log(`  이유: ${result.reason}`)

            // 신뢰도 70% 이상이고 카테고리가 다르면 업데이트
            if (result.confidence >= 70 && result.category !== issue.category) {
                changes.push({
                    title: issue.title,
                    before: issue.category,
                    after: result.category,
                    confidence: result.confidence
                })

                if (!dryRun) {
                    const { error: updateError } = await supabaseAdmin
                        .from('issues')
                        .update({ category: result.category })
                        .eq('id', issue.id)

                    if (updateError) {
                        console.error(`  ❌ 업데이트 에러:`, updateError)
                        errorCount++
                        continue
                    }
                }

                console.log(`  ${dryRun ? '🔍' : '✅'} 변경: ${issue.category} → ${result.category}`)
                updatedCount++
            } else if (result.category === issue.category) {
                console.log(`  ⏭️  동일: 변경 불필요`)
                skippedCount++
            } else {
                console.log(`  ⚠️  신뢰도 낮음: 변경 안 함 (${result.confidence}%)`)
                skippedCount++
            }

            // Rate Limit 방지
            if (i < issues.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay))
            }

        } catch (error: any) {
            console.error(`  ❌ AI 분류 에러:`, error.message)
            errorCount++
            
            // Rate Limit 발생 시 중단
            if (error.status === 429) {
                console.log('\n⚠️  Rate Limit 도달. 재분류 중단.')
                console.log('내일 다시 시도하거나, 다음 명령으로 일부만 재분류하세요:')
                console.log(`  npx tsx scripts/reclassify-all-recent-issues.ts --days 1`)
                break
            }
        }
    }

    // 3. 결과 요약
    console.log('\n' + '━'.repeat(80))
    console.log('\n=== 재분류 완료 ===\n')
    console.log(`총 처리: ${issues.length}개`)
    console.log(`변경됨: ${updatedCount}개`)
    console.log(`스킵됨: ${skippedCount}개`)
    console.log(`에러: ${errorCount}개`)

    if (dryRun) {
        console.log('\n⚠️  DRY RUN 모드로 실행되었습니다. 실제 데이터는 변경되지 않았습니다.')
        console.log('실제로 적용하려면:')
        console.log('  npx tsx scripts/reclassify-all-recent-issues.ts --apply')
    }

    // 4. 변경 상세 내역
    if (changes.length > 0) {
        console.log('\n━'.repeat(80))
        console.log('\n📋 변경 상세 내역\n')
        
        changes.forEach((change, idx) => {
            console.log(`${idx + 1}. ${change.title.substring(0, 60)}...`)
            console.log(`   ${change.before} → ${change.after} (신뢰도: ${change.confidence}%)\n`)
        })
    }

    // 5. 카테고리별 변경 요약
    if (changes.length > 0) {
        console.log('━'.repeat(80))
        console.log('\n📊 카테고리별 변경 요약\n')
        
        const changeSummary: Record<string, number> = {}
        changes.forEach(c => {
            const key = `${c.before} → ${c.after}`
            changeSummary[key] = (changeSummary[key] || 0) + 1
        })
        
        Object.entries(changeSummary)
            .sort((a, b) => b[1] - a[1])
            .forEach(([key, count]) => {
                console.log(`  ${key}: ${count}건`)
            })
    }
}

// CLI 인자 파싱
const args = process.argv.slice(2)
const options: ReclassifyOptions = {
    dryRun: !args.includes('--apply'),
    days: 7,
    delay: 3000,
}

const daysIndex = args.indexOf('--days')
if (daysIndex !== -1 && args[daysIndex + 1]) {
    options.days = parseInt(args[daysIndex + 1])
}

const categoryIndex = args.indexOf('--category')
if (categoryIndex !== -1 && args[categoryIndex + 1]) {
    options.categories = [args[categoryIndex + 1]]
}

const delayIndex = args.indexOf('--delay')
if (delayIndex !== -1 && args[delayIndex + 1]) {
    options.delay = parseInt(args[delayIndex + 1])
}

// 실행
reclassifyRecentIssues(options).catch(console.error)
