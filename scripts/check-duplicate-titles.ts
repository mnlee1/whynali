/**
 * scripts/check-duplicate-titles.ts
 * 
 * 제목이 같은 이슈가 여러 개 있는지 확인
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function checkDuplicateTitles() {
    console.log('=== 중복 제목 이슈 검사 ===\n')

    // 1. 모든 이슈 조회 (승인/대기/반려 전부)
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, approval_status, created_at, heat_index')
        .order('title')

    if (error || !issues) {
        console.error('이슈 조회 에러:', error)
        return
    }

    console.log(`총 ${issues.length}개 이슈 조회\n`)

    // 2. 제목별로 그룹화
    const titleMap = new Map<string, typeof issues>()
    for (const issue of issues) {
        if (!titleMap.has(issue.title)) {
            titleMap.set(issue.title, [])
        }
        titleMap.get(issue.title)!.push(issue)
    }

    // 3. 중복 제목 찾기
    const duplicates = Array.from(titleMap.entries())
        .filter(([_, issues]) => issues.length > 1)

    if (duplicates.length === 0) {
        console.log('✅ 중복 제목 없음\n')
    } else {
        console.log(`⚠️  중복 제목 발견: ${duplicates.length}개\n`)
        
        for (const [title, dupeIssues] of duplicates) {
            console.log(`\n제목: "${title}"`)
            console.log(`중복 개수: ${dupeIssues.length}개`)
            for (const issue of dupeIssues) {
                console.log(`  - ID: ${issue.id.substring(0, 8)}...`)
                console.log(`    카테고리: ${issue.category}`)
                console.log(`    화력: ${issue.heat_index}`)
                console.log(`    생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
            }
        }
    }

    // 4. 이하늬 관련 이슈 찾기
    console.log('\n\n=== 이하늬 관련 이슈 ===\n')
    
    const haNeulIssues = issues.filter(issue => 
        issue.title.includes('이하늬') || 
        issue.title.includes('하늬')
    )

    if (haNeulIssues.length === 0) {
        console.log('이하늬 관련 이슈 없음\n')
    } else {
        console.log(`총 ${haNeulIssues.length}개 발견\n`)
        
        for (const issue of haNeulIssues) {
            console.log(`\n제목: "${issue.title}"`)
            console.log(`  ID: ${issue.id}`)
            console.log(`  카테고리: ${issue.category}`)
            console.log(`  화력: ${issue.heat_index}`)
            console.log(`  생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
            
            // 해당 이슈의 뉴스 데이터 확인
            const { data: newsData } = await supabaseAdmin
                .from('news_data')
                .select('title, created_at')
                .eq('issue_id', issue.id)
                .order('created_at', { ascending: false })
                .limit(5)
            
            if (newsData && newsData.length > 0) {
                console.log(`  뉴스 ${newsData.length}건:`)
                for (const news of newsData) {
                    console.log(`    - ${news.title}`)
                }
            }
        }
    }

    // 5. 유사 제목 찾기 (이하늬 케이스)
    console.log('\n\n=== 유사 제목 분석 (이하늬) ===\n')
    
    if (haNeulIssues.length > 1) {
        console.log('이하늬 이슈가 여러 개로 쪼개져 있습니다!\n')
        
        for (let i = 0; i < haNeulIssues.length; i++) {
            for (let j = i + 1; j < haNeulIssues.length; j++) {
                const issue1 = haNeulIssues[i]
                const issue2 = haNeulIssues[j]
                
                console.log(`\n비교:`)
                console.log(`  [A] "${issue1.title}"`)
                console.log(`      생성: ${new Date(issue1.created_at).toLocaleString('ko-KR')}`)
                console.log(`  [B] "${issue2.title}"`)
                console.log(`      생성: ${new Date(issue2.created_at).toLocaleString('ko-KR')}`)
                
                // 시간 차이 계산
                const timeDiff = Math.abs(
                    new Date(issue1.created_at).getTime() - 
                    new Date(issue2.created_at).getTime()
                )
                const hoursDiff = timeDiff / (1000 * 60 * 60)
                
                console.log(`  시간 차이: ${hoursDiff.toFixed(1)}시간`)
                
                if (hoursDiff < 24) {
                    console.log(`  ⚠️  같은 날 생성됨 - 쪼개진 이슈일 가능성 높음!`)
                }
            }
        }
    }
}

checkDuplicateTitles().catch(console.error)
