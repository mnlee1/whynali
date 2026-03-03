/**
 * scripts/analyze_issue_category.ts
 * 
 * 특정 이슈의 카테고리 분류 원인 심층 분석
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// .env.local 파일 직접 파싱
const envPath = join(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        if (!process.env[key]) {
            process.env[key] = value
        }
    }
})

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
})

async function analyzeIssue(issueId: string, issueTitle: string) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`이슈 분석: ${issueTitle}`)
    console.log(`이슈 ID: ${issueId}`)
    console.log('='.repeat(80))

    // 1. 이슈 상세 정보
    const { data: issue, error: issueErr } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()

    if (issueErr) {
        console.error('이슈 조회 오류:', issueErr)
        return
    }

    console.log(`\n[이슈 정보]`)
    console.log(`카테고리: ${issue.category}`)
    console.log(`생성일: ${issue.created_at}`)
    console.log(`AI 카테고리: ${issue.ai_category || 'N/A'}`)

    // 2. 연결된 뉴스 데이터 조회 (issue_id로 직접 연결)
    const { data: newsData, error: newsDataErr } = await supabase
        .from('news_data')
        .select('*')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: false })

    console.log(`\n[연결된 뉴스 수: ${newsData?.length || 0}개]`)

    if (newsDataErr) {
        console.error('뉴스 데이터 조회 오류:', newsDataErr)
    } else if (newsData && newsData.length > 0) {
            // 카테고리별 집계
            const categoryCount: Record<string, number> = {}
            const categoryKeywords: Record<string, string[]> = {}
            
            console.log(`\n[뉴스 상세 목록]`)
            newsData.forEach((news, idx) => {
                console.log(`\n${idx + 1}. ${news.title}`)
                console.log(`   출처: ${news.source}`)
                console.log(`   카테고리: ${news.category || '없음'}`)
                console.log(`   수집일: ${news.created_at}`)
                
                if (news.category) {
                    categoryCount[news.category] = (categoryCount[news.category] || 0) + 1
                    if (!categoryKeywords[news.category]) {
                        categoryKeywords[news.category] = []
                    }
                    // 제목에서 키워드 추출 (띄어쓰기 기준)
                    const words = news.title.split(/\s+/).filter((w: string) => w.length >= 2)
                    categoryKeywords[news.category].push(...words)
                }
            })

            console.log(`\n[카테고리별 집계]`)
            Object.entries(categoryCount)
                .sort((a, b) => b[1] - a[1])
                .forEach(([cat, count]) => {
                    const percentage = ((count / newsData.length) * 100).toFixed(1)
                    console.log(`${cat}: ${count}건 (${percentage}%)`)
                })

            console.log(`\n[카테고리별 주요 키워드]`)
            Object.entries(categoryKeywords).forEach(([cat, words]) => {
                const wordCount: Record<string, number> = {}
                words.forEach((w: string) => {
                    wordCount[w] = (wordCount[w] || 0) + 1
                })
                const top5 = Object.entries(wordCount)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([w, c]) => `${w}(${c})`)
                console.log(`${cat}: ${top5.join(', ')}`)
            })

            // 3. "스포츠" 키워드 분석
            console.log(`\n[스포츠 키워드 분석]`)
            const sportsKeyword = newsData.filter(n => n.title.includes('스포츠'))
            if (sportsKeyword.length > 0) {
                console.log(`"스포츠" 키워드가 제목에 포함된 뉴스: ${sportsKeyword.length}개`)
                sportsKeyword.forEach((news, idx) => {
                    console.log(`  ${idx + 1}. [${news.category}] ${news.title}`)
                })
            } else {
                console.log(`"스포츠" 키워드가 제목에 포함된 뉴스 없음`)
            }
    } else {
        console.log('연결된 뉴스 없음')
    }

    // 4. 연결된 커뮤니티 데이터 조회 (issue_id로 직접 연결)
    const { data: communityData, error: commDataErr } = await supabase
        .from('community_data')
        .select('*')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: false })

    if (!commDataErr && communityData && communityData.length > 0) {
        console.log(`\n[연결된 커뮤니티 글 수: ${communityData.length}개]`)
        communityData.forEach((comm, idx) => {
            console.log(`\n${idx + 1}. ${comm.title}`)
            console.log(`   출처: ${comm.source}`)
            console.log(`   수집일: ${comm.created_at}`)
        })
    }
}

async function main() {
    console.log('왜난리 이슈 카테고리 오분류 원인 분석')
    console.log('=' .repeat(80))

    // 분석 대상 이슈들
    const issues = [
        {
            id: 'f6d1fdc7-345e-4319-88fd-e72d5f7a9363',
            title: '정부, 하천·계곡 불법 시설 전면 재조사'
        },
        {
            id: '3745fe2d-d2ad-49a9-85ec-393b4bb61434',
            title: '넥센타이어, 신형 BMW iX3에 신차용 타이어로 엔페라 스포츠 공급'
        }
    ]

    for (const issue of issues) {
        await analyzeIssue(issue.id, issue.title)
    }

    console.log(`\n${'='.repeat(80)}`)
    console.log('분석 완료')
    console.log('='.repeat(80))
}

main().then(() => {
    process.exit(0)
}).catch((err) => {
    console.error('오류 발생:', err)
    process.exit(1)
})
