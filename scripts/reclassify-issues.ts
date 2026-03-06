/**
 * scripts/reclassify-issues.ts
 * 
 * 기존 이슈를 AI로 재분류하는 스크립트
 * 
 * 실행:
 * npx tsx scripts/reclassify-issues.ts
 * 
 * 옵션:
 * - 전체 재분류: npx tsx scripts/reclassify-issues.ts --all
 * - 특정 카테고리: npx tsx scripts/reclassify-issues.ts --category 스포츠
 * - Dry Run (실제 업데이트 안 함): npx tsx scripts/reclassify-issues.ts --dry-run
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

// .env.local 파일 로드
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'
import { classifyCategoryByAI } from '../lib/candidate/category-classifier'
import type { IssueCategory } from '@/lib/config/categories'

interface ReclassifyOptions {
    all?: boolean
    category?: string
    dryRun?: boolean
    limit?: number
}

async function reclassifyIssues(options: ReclassifyOptions = {}) {
    const {
        all = false,
        category = null,
        dryRun = false,
        limit = 100,
    } = options

    console.log('=== 이슈 재분류 시작 ===\n')
    console.log(`모드: ${dryRun ? 'DRY RUN (실제 업데이트 안 함)' : '실제 업데이트'}`)
    console.log(`대상: ${all ? '전체 이슈' : category ? `${category} 카테고리` : '최근 100개'}`)
    console.log(`제한: ${limit}개\n`)

    // 1. 대상 이슈 조회
    let query = supabaseAdmin
        .from('issues')
        .select('id, title, category')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (category && !all) {
        query = query.eq('category', category)
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

    // 2. 각 이슈별로 재분류
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (let i = 0; i < issues.length; i++) {
        const issue = issues[i]
        const progress = `[${i + 1}/${issues.length}]`

        console.log(`\n${progress} "${issue.title.substring(0, 50)}..."`)
        console.log(`  현재 카테고리: ${issue.category}`)

        try {
            // AI 재분류
            const result = await classifyCategoryByAI([issue.title])

            console.log(`  AI 분류: ${result.category} (신뢰도: ${result.confidence}%)`)
            console.log(`  이유: ${result.reason}`)

            // 신뢰도 80% 이상이고 카테고리가 다르면 업데이트
            if (result.confidence >= 80 && result.category !== issue.category) {
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

                console.log(`  ✅ 변경: ${issue.category} → ${result.category}`)
                updatedCount++
            } else if (result.category === issue.category) {
                console.log(`  ⏭️  동일: 변경 불필요`)
                skippedCount++
            } else {
                console.log(`  ⚠️  신뢰도 낮음: 변경 안 함`)
                skippedCount++
            }

        } catch (error) {
            console.error(`  ❌ AI 분류 에러:`, error)
            errorCount++
        }

        // Rate Limit 방지 (2초 대기)
        if (i < issues.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
    }

    // 3. 결과 요약
    console.log('\n=== 재분류 완료 ===\n')
    console.log(`총 처리: ${issues.length}개`)
    console.log(`변경됨: ${updatedCount}개`)
    console.log(`스킵됨: ${skippedCount}개`)
    console.log(`에러: ${errorCount}개`)

    if (dryRun) {
        console.log('\n⚠️  DRY RUN 모드로 실행되었습니다. 실제 데이터는 변경되지 않았습니다.')
        console.log('실제로 적용하려면: npx tsx scripts/reclassify-issues.ts')
    }
}

// CLI 인자 파싱
const args = process.argv.slice(2)
const options: ReclassifyOptions = {
    all: args.includes('--all'),
    dryRun: args.includes('--dry-run'),
}

const categoryIndex = args.indexOf('--category')
if (categoryIndex !== -1 && args[categoryIndex + 1]) {
    options.category = args[categoryIndex + 1]
}

const limitIndex = args.indexOf('--limit')
if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1])
}

// 실행
reclassifyIssues(options).catch(console.error)
