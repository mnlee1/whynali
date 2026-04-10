/**
 * scripts/seed-real-issues.ts
 *
 * 런칭 준비용 실 이슈 시드 스크립트
 *
 * - 네이버 뉴스 API로 카테고리별 현재 뉴스 수집
 * - Groq AI가 헤드라인을 읽고 이슈로 묶음
 * - 실서버 DB(whynali-main)에 승인 상태로 직접 삽입
 * - 카테고리당 10개 목표, 이미 있는 만큼 제외
 *
 * 실행:
 * npx tsx scripts/seed-real-issues.ts
 */

import { config } from 'dotenv'
import Groq from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'

// .env.local에서 Naver, Groq 키 로드
config({ path: '.env.local' })

// 실서버 Supabase 설정 (환경변수 덮어쓰기)
const PROD_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PROD_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!PROD_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
}

const supabase = createClient(PROD_SUPABASE_URL, PROD_SERVICE_ROLE_KEY)

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID!
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!
const GROQ_KEYS = (process.env.GROQ_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)

const TARGET_PER_CATEGORY = 10
const CATEGORIES = ['연예', '스포츠', '정치', '사회', '경제', '기술', '세계'] as const
type Category = typeof CATEGORIES[number]

// ──────────────────────────────────────────────
// 1. 카테고리별 현재 이슈 수 조회
// ──────────────────────────────────────────────
async function getCurrentCounts(): Promise<Record<Category, number>> {
    const { data, error } = await supabase
        .from('issues')
        .select('category')
        .eq('approval_status', '승인')

    if (error) throw new Error(`이슈 조회 실패: ${error.message}`)

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
        counts[row.category] = (counts[row.category] ?? 0) + 1
    }

    const result = {} as Record<Category, number>
    for (const cat of CATEGORIES) {
        result[cat] = counts[cat] ?? 0
    }
    return result
}

// ──────────────────────────────────────────────
// 2. 네이버 뉴스 수집
// ──────────────────────────────────────────────
async function fetchNaverNews(category: Category): Promise<string[]> {
    // 카테고리별 검색어 (네이버에서 잘 걸리는 키워드)
    const queryMap: Record<Category, string> = {
        '연예': '연예 이슈',
        '스포츠': '스포츠 이슈',
        '정치': '정치 논란',
        '사회': '사회 사건',
        '경제': '경제 이슈',
        '기술': 'IT 기술 이슈',
        '세계': '국제 뉴스',
    }

    const query = queryMap[category]
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=100&sort=sim`

    const res = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
    })

    if (!res.ok) {
        console.error(`  네이버 API 오류 (${category}): ${res.status}`)
        return []
    }

    const data = await res.json()
    const items = data.items ?? []

    // HTML 태그 제거 후 제목만 추출
    return items.map((item: { title: string }) =>
        item.title.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
    )
}

// ──────────────────────────────────────────────
// 3. Groq AI로 이슈 묶음 생성
// ──────────────────────────────────────────────
interface IssueCandidate {
    title: string
    status: '점화' | '논란중'
    heat: number
}

async function generateIssues(category: Category, headlines: string[], count: number): Promise<IssueCandidate[]> {
    const groq = new Groq({ apiKey: GROQ_KEYS[0] })

    const headlineText = headlines.slice(0, 80).map((h, i) => `${i + 1}. ${h}`).join('\n')

    const prompt = `당신은 한국 뉴스 편집자입니다. 아래는 "${category}" 분야 최신 뉴스 헤드라인 목록입니다.

이 헤드라인들을 분석해서, 현재 실제로 화제가 되고 있는 뚜렷한 이슈 ${count}개를 골라주세요.

조건:
- 비슷한 헤드라인은 하나의 이슈로 묶기
- 단순 정보성 기사가 아닌, 논란·논쟁·주목도가 높은 이슈 우선
- 제목은 15~35자 한국어, 직관적으로
- status: '점화'(막 터진 이슈) 또는 '논란중'(며칠째 지속)
- heat: 35~90 사이 숫자 (화제성 높을수록 높게)

헤드라인 목록:
${headlineText}

JSON 배열만 출력 (다른 텍스트 없이):
[
  {
    "title": "이슈 제목",
    "status": "점화",
    "heat": 75
  }
]`

    let lastError: Error | null = null

    for (const key of GROQ_KEYS) {
        try {
            const groqClient = new Groq({ apiKey: key })
            const res = await groqClient.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 4000,
            })

            const content = res.choices[0]?.message?.content ?? ''

            // JSON 배열 추출
            const match = content.match(/\[[\s\S]*\]/)
            if (!match) throw new Error('JSON 배열을 찾을 수 없음')

            const parsed = JSON.parse(match[0]) as IssueCandidate[]
            return parsed.slice(0, count)
        } catch (e) {
            lastError = e as Error
            console.warn(`  Groq 키 실패, 다음 키 시도...`)
        }
    }

    throw lastError ?? new Error('모든 Groq 키 실패')
}

// ──────────────────────────────────────────────
// 4. Supabase에 이슈 삽입
// ──────────────────────────────────────────────
async function insertIssues(category: Category, issues: IssueCandidate[]): Promise<number> {
    const rows = issues.map(issue => ({
        title: issue.title,
        status: issue.status,
        category,
        heat_index: issue.heat,
        created_heat_index: issue.heat,
        approval_status: '승인',
        approval_type: 'manual',
        visibility_status: 'visible',
        source_track: 'track_a',
        approved_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
        .from('issues')
        .insert(rows)
        .select('id')

    if (error) throw new Error(`삽입 실패 (${category}): ${error.message}`)
    return data?.length ?? 0
}

// ──────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────
async function main() {
    console.log('\n🚀 실 이슈 시드 시작\n')
    console.log(`📡 DB: ${PROD_SUPABASE_URL}`)
    console.log(`🔑 Groq 키: ${GROQ_KEYS.length}개\n`)

    // 현재 카테고리별 이슈 수 확인
    const currentCounts = await getCurrentCounts()
    console.log('📊 현재 이슈 현황:')
    for (const cat of CATEGORIES) {
        const count = currentCounts[cat]
        const need = Math.max(0, TARGET_PER_CATEGORY - count)
        console.log(`  ${cat}: ${count}개 (${need > 0 ? `${need}개 추가 필요` : '완료'})`)
    }
    console.log()

    let totalAdded = 0

    for (const category of CATEGORIES) {
        const current = currentCounts[category]
        const need = TARGET_PER_CATEGORY - current

        if (need <= 0) {
            console.log(`✅ ${category}: 이미 ${current}개, 건너뜀`)
            continue
        }

        console.log(`\n🔍 ${category}: ${need}개 추가 중...`)

        // 네이버 뉴스 수집
        const headlines = await fetchNaverNews(category)
        console.log(`  뉴스 수집: ${headlines.length}건`)

        if (headlines.length < 5) {
            console.warn(`  ⚠️  헤드라인이 부족합니다. 건너뜀.`)
            continue
        }

        // AI 이슈 생성
        console.log(`  Groq AI 분석 중...`)
        const issues = await generateIssues(category, headlines, need)
        console.log(`  생성된 이슈: ${issues.length}개`)

        for (const issue of issues) {
            console.log(`    - [${issue.status}|${issue.heat}] ${issue.title}`)
        }

        // DB 삽입
        const inserted = await insertIssues(category, issues)
        totalAdded += inserted
        console.log(`  ✅ ${inserted}개 삽입 완료`)

        // API 레이트 리밋 방지
        await new Promise(r => setTimeout(r, 1500))
    }

    console.log(`\n🎉 완료! 총 ${totalAdded}개 이슈 추가됨\n`)

    // 최종 현황
    const finalCounts = await getCurrentCounts()
    console.log('📊 최종 이슈 현황:')
    for (const cat of CATEGORIES) {
        console.log(`  ${cat}: ${finalCounts[cat]}개`)
    }
    console.log()
}

main().catch(err => {
    console.error('❌ 오류:', err)
    process.exit(1)
})
