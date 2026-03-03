/**
 * scripts/check_sports_issues.ts
 * 
 * 특정 이슈들의 카테고리 분류 원인 분석 스크립트
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

async function checkIssues() {
    console.log('=== 스포츠 카테고리 오분류 이슈 조사 ===\n')

    // 1. 하천·계곡 불법 시설 이슈 찾기
    const { data: issue1, error: err1 } = await supabase
        .from('issues')
        .select('*')
        .ilike('title', '%하천%')
        .or('title.ilike.%계곡%,title.ilike.%불법%')
        .eq('category', '스포츠')
        .order('created_at', { ascending: false })
        .limit(5)

    console.log('1. 하천/계곡 관련 스포츠 이슈:')
    if (err1) {
        console.error('조회 오류:', err1)
    } else if (issue1 && issue1.length > 0) {
        issue1.forEach((issue) => {
            console.log(`\nID: ${issue.id}`)
            console.log(`제목: ${issue.title}`)
            console.log(`카테고리: ${issue.category}`)
            console.log(`설명: ${issue.description?.substring(0, 100)}...`)
            console.log(`생성일: ${issue.created_at}`)
        })
    } else {
        console.log('해당 이슈를 찾을 수 없습니다.')
    }

    // 2. 넥센타이어 이슈 찾기
    const { data: issue2, error: err2 } = await supabase
        .from('issues')
        .select('*')
        .ilike('title', '%넥센%')
        .eq('category', '스포츠')
        .order('created_at', { ascending: false })
        .limit(5)

    console.log('\n\n2. 넥센타이어 관련 스포츠 이슈:')
    if (err2) {
        console.error('조회 오류:', err2)
    } else if (issue2 && issue2.length > 0) {
        issue2.forEach((issue) => {
            console.log(`\nID: ${issue.id}`)
            console.log(`제목: ${issue.title}`)
            console.log(`카테고리: ${issue.category}`)
            console.log(`설명: ${issue.description?.substring(0, 100)}...`)
            console.log(`생성일: ${issue.created_at}`)
        })
    } else {
        console.log('해당 이슈를 찾을 수 없습니다.')
    }

    // 3. 최근 스포츠 카테고리 이슈 20개 목록
    const { data: recentSports, error: err3 } = await supabase
        .from('issues')
        .select('id, title, category, created_at')
        .eq('category', '스포츠')
        .order('created_at', { ascending: false })
        .limit(20)

    console.log('\n\n3. 최근 스포츠 카테고리 이슈 20개:')
    if (err3) {
        console.error('조회 오류:', err3)
    } else if (recentSports) {
        recentSports.forEach((issue, idx) => {
            console.log(`${idx + 1}. [${issue.id}] ${issue.title}`)
        })
    }

    // 4. 이슈 ID로 직접 조회 (사용자가 제공한 정확한 제목으로)
    console.log('\n\n4. 제목으로 직접 검색:')
    
    const { data: issue3, error: err4 } = await supabase
        .from('issues')
        .select('*')
        .ilike('title', '%정부%하천%')
        .order('created_at', { ascending: false })
        .limit(3)

    if (issue3 && issue3.length > 0) {
        console.log('\n"정부, 하천" 관련 이슈:')
        issue3.forEach((issue) => {
            console.log(`\nID: ${issue.id}`)
            console.log(`제목: ${issue.title}`)
            console.log(`카테고리: ${issue.category}`)
        })
    }

    const { data: issue4, error: err5 } = await supabase
        .from('issues')
        .select('*')
        .ilike('title', '%BMW%')
        .order('created_at', { ascending: false })
        .limit(3)

    if (issue4 && issue4.length > 0) {
        console.log('\n\nBMW 관련 이슈:')
        issue4.forEach((issue) => {
            console.log(`\nID: ${issue.id}`)
            console.log(`제목: ${issue.title}`)
            console.log(`카테고리: ${issue.category}`)
        })
    }
}

async function analyzeIssueSources(issueId: string) {
    console.log(`\n\n=== 이슈 ${issueId} 원본 뉴스/커뮤니티 데이터 분석 ===\n`)

    // 연결된 뉴스 데이터 조회
    const { data: newsLinks, error: newsErr } = await supabase
        .from('issue_news')
        .select('news_id')
        .eq('issue_id', issueId)

    if (newsErr) {
        console.error('뉴스 링크 조회 오류:', newsErr)
        return
    }

    if (newsLinks && newsLinks.length > 0) {
        const newsIds = newsLinks.map(link => link.news_id)
        const { data: newsData, error: newsDataErr } = await supabase
            .from('news_data')
            .select('title, category, source')
            .in('id', newsIds)

        console.log('연결된 뉴스 데이터:')
        if (newsDataErr) {
            console.error('뉴스 데이터 조회 오류:', newsDataErr)
        } else if (newsData) {
            newsData.forEach((news, idx) => {
                console.log(`${idx + 1}. [${news.category}] ${news.title} (${news.source})`)
            })

            // 카테고리별 집계
            const categoryCount: Record<string, number> = {}
            newsData.forEach(news => {
                if (news.category) {
                    categoryCount[news.category] = (categoryCount[news.category] || 0) + 1
                }
            })
            console.log('\n카테고리별 집계:', categoryCount)
        }
    } else {
        console.log('연결된 뉴스 데이터가 없습니다.')
    }
}

checkIssues().then(() => {
    console.log('\n\n분석 완료.')
    process.exit(0)
}).catch((err) => {
    console.error('오류 발생:', err)
    process.exit(1)
})
