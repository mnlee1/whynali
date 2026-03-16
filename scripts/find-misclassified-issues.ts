/**
 * scripts/find-misclassified-issues.ts
 * 
 * 키워드 방식으로 오분류 의심 케이스 찾기 (AI 호출 없음)
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function findMisclassifiedIssues() {
    console.log('=== 오분류 의심 케이스 찾기 (AI 호출 없음) ===\n')

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, heat_index, approval_status, created_at')
        .in('approval_status', ['승인', '대기'])
        .order('created_at', { ascending: false })
        .limit(100)

    if (!issues || issues.length === 0) {
        console.log('이슈가 없습니다.')
        return
    }

    console.log(`총 ${issues.length}개 이슈 검토\n`)

    // 오분류 패턴
    const patterns = [
        {
            name: '무신사/쿠팡 → 스포츠 오분류',
            check: (title: string, category: string) => 
                (title.includes('무신사') || title.includes('쿠팡') || title.includes('이커머스')) && 
                category === '스포츠',
            correctCategory: '기술'
        },
        {
            name: '스포츠마케팅 → 스포츠 오분류',
            check: (title: string, category: string) => 
                title.includes('스포츠마케팅') && category === '스포츠',
            correctCategory: '사회'
        },
        {
            name: 'IOC/국제시상 → 기술 오분류',
            check: (title: string, category: string) => 
                (title.includes('IOC') || title.includes('시상') || title.includes('Awards')) && 
                category === '기술',
            correctCategory: '스포츠'
        },
        {
            name: '선수 경기/대회 → 사회 오분류',
            check: (title: string, category: string) => 
                (title.includes('경기') || title.includes('득점') || title.includes('우승')) && 
                category === '사회',
            correctCategory: '스포츠'
        },
        {
            name: '연예인 부동산 → 스포츠 오분류',
            check: (title: string, category: string) => 
                (title.includes('한남더힐') || title.includes('매각') || title.includes('부동산')) && 
                category === '스포츠',
            correctCategory: '연예'
        }
    ]

    const suspected: Array<{
        issue: any
        pattern: string
        correctCategory: string
    }> = []

    for (const issue of issues) {
        for (const pattern of patterns) {
            if (pattern.check(issue.title, issue.category)) {
                suspected.push({
                    issue,
                    pattern: pattern.name,
                    correctCategory: pattern.correctCategory
                })
                break
            }
        }
    }

    if (suspected.length === 0) {
        console.log('✅ 오분류 의심 케이스가 없습니다!\n')
        console.log('모든 이슈가 올바르게 분류되어 있는 것으로 보입니다.')
        return
    }

    console.log(`⚠️  오분류 의심 케이스: ${suspected.length}개 발견\n`)
    console.log('━'.repeat(80))

    suspected.forEach((item, idx) => {
        console.log(`\n${idx + 1}. ${item.issue.title}`)
        console.log(`   ID: ${item.issue.id}`)
        console.log(`   현재: ${item.issue.category}`)
        console.log(`   예상: ${item.correctCategory}`)
        console.log(`   패턴: ${item.pattern}`)
        console.log(`   화력: ${item.issue.heat_index}점 | ${item.issue.approval_status}`)
        console.log(`   등록: ${item.issue.created_at.split('T')[0]}`)
    })

    console.log('\n' + '━'.repeat(80))
    console.log('\n💡 수동 재분류 방법:\n')
    
    suspected.forEach((item, idx) => {
        console.log(`${idx + 1}. npx tsx scripts/reclassify-single-issue.ts ${item.issue.id}`)
    })

    console.log('\n또는 키워드 기반 일괄 수정:')
    console.log('  npx tsx scripts/fix-suspected-issues.ts')
}

findMisclassifiedIssues().catch(console.error)
