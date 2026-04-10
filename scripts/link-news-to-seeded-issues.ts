/**
 * scripts/link-news-to-seeded-issues.ts
 *
 * 강제 삽입된 이슈(approval_type=manual)에 실제 뉴스 연결
 *
 * 1. 실서버 DB에서 수동 삽입 이슈 목록 조회
 * 2. 이슈 제목으로 네이버 뉴스 검색
 * 3. news_data 테이블에 issue_id 연결하여 삽입
 * 4. update-timeline 크론 호출 → 타임라인 자동 생성
 *
 * 실행:
 * npx tsx scripts/link-news-to-seeded-issues.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mdxshmfmcdcotteevwgi.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID!
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!
const CRON_SECRET = process.env.CRON_SECRET!
const SITE_URL = 'https://whynali.com'

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

function extractSource(url: string): string {
    try {
        return new URL(url).hostname.replace('www.', '')
    } catch {
        return 'unknown'
    }
}

// ──────────────────────────────────────────────
// 1. 수동 삽입 이슈 조회
// ──────────────────────────────────────────────
async function getSeededIssues() {
    const { data, error } = await supabase
        .from('issues')
        .select('id, title, category')
        .eq('approval_status', '승인')
        .eq('approval_type', 'manual')
        .order('created_at', { ascending: false })

    if (error) throw new Error(`이슈 조회 실패: ${error.message}`)
    return data ?? []
}

// ──────────────────────────────────────────────
// 2. 네이버 뉴스 검색
// ──────────────────────────────────────────────
async function searchNews(keyword: string, category: string) {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=10&sort=sim`

    const res = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
    })

    if (!res.ok) return []

    const data = await res.json()
    const items = data.items ?? []

    return items.map((item: { title: string; originallink?: string; link: string; pubDate: string }) => ({
        title: stripHtml(item.title),
        link: item.originallink || item.link,
        source: extractSource(item.originallink || item.link),
        published_at: new Date(item.pubDate).toISOString(),
        category,
        search_keyword: keyword,
    }))
}

// ──────────────────────────────────────────────
// 3. news_data에 issue_id 연결하여 삽입
// ──────────────────────────────────────────────
async function insertNewsForIssue(issueId: string, newsItems: ReturnType<typeof searchNews> extends Promise<infer T> ? T : never) {
    if (!newsItems.length) return 0

    const rows = newsItems.map(item => ({ ...item, issue_id: issueId }))

    const { data, error } = await supabase
        .from('news_data')
        .upsert(rows, { onConflict: 'link', ignoreDuplicates: true })
        .select('id')

    if (error) {
        console.error(`  뉴스 삽입 오류: ${error.message}`)
        return 0
    }
    return data?.length ?? 0
}

// ──────────────────────────────────────────────
// 4. update-timeline 크론 호출
// ──────────────────────────────────────────────
async function runUpdateTimeline() {
    if (!CRON_SECRET) {
        console.log('  ⚠️  CRON_SECRET 없음 — 타임라인 크론 건너뜀 (Vercel에서 자동 실행됨)')
        return
    }

    console.log('\n⏱️  update-timeline 크론 호출 중...')
    const res = await fetch(`${SITE_URL}/api/cron/update-timeline`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
            'Content-Type': 'application/json',
        },
    })

    const result = await res.json()
    console.log(`  결과: ${JSON.stringify(result)}`)
}

// ──────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────
async function main() {
    console.log('\n🔗 이슈-뉴스 연결 작업 시작\n')

    const issues = await getSeededIssues()
    console.log(`대상 이슈: ${issues.length}개\n`)

    let totalNews = 0

    for (const issue of issues) {
        console.log(`🔍 [${issue.category}] ${issue.title}`)

        const newsItems = await searchNews(issue.title, issue.category)
        console.log(`  검색된 뉴스: ${newsItems.length}건`)

        if (newsItems.length === 0) {
            console.log('  ⚠️  관련 뉴스 없음, 건너뜀')
            continue
        }

        const inserted = await insertNewsForIssue(issue.id, newsItems)
        totalNews += inserted
        console.log(`  ✅ ${inserted}건 삽입`)

        // 네이버 API 레이트 리밋 방지
        await new Promise(r => setTimeout(r, 300))
    }

    console.log(`\n📰 총 ${totalNews}건 뉴스 연결 완료`)

    // update-timeline 크론 실행
    await runUpdateTimeline()

    console.log('\n🎉 완료! 타임라인은 크론 실행 후 자동 생성됩니다.\n')
}

main().catch(err => {
    console.error('❌ 오류:', err)
    process.exit(1)
})
