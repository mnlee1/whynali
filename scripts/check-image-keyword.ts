/**
 * scripts/check-image-keyword.ts
 *
 * 특정 이슈의 이미지 검색 키워드 확인 (이미지 저장 없음, 읽기 전용)
 * 실행: npx tsx scripts/check-image-keyword.ts "이슈 제목 일부"
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const isProduction = process.env.PRODUCTION === 'true'
const supabaseUrl = isProduction
    ? process.env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL!
    : process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = isProduction
    ? process.env.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY!
    : process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function extractKeywordsAndTone(title: string, category: string): Promise<{ keywords: string; isDark: boolean } | null> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) {
        console.log('⚠️  GROQ_API_KEY 없음')
        return null
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{
                role: 'user',
                content: `You are finding stock photos for Korean news articles. Extract 2-3 English keywords for the visual background image, then add ::dark or ::bright based on the issue tone.

Rules:
- ::dark → controversy, scandal, accident, crime, conflict, death, protest, crisis, defeat
- ::bright → comeback, release, achievement, award, victory, celebration, debut

Category: ${category}
Examples:
- [연예] "BTS 새 앨범 발매" → "music concert stage::bright"
- [연예] "지수 친오빠 크레딧 삭제 논란" → "music studio silhouette::dark"
- [연예] "아이유 콘서트 매진" → "concert spotlight stage::bright"
- [연예] "배우 음주운전 적발" → "night city road::dark"
- [스포츠] "토트넘 강등 위기" → "soccer stadium empty::dark"
- [스포츠] "손흥민 골든부트 수상" → "soccer trophy celebration::bright"
- [정치] "국회의원 막말 논란" → "parliament building shadow::dark"
- [사회] "이태원 참사 추모" → "memorial candles vigil::dark"
- [경제] "삼성전자 노조 파업" → "factory gate protest::dark"
- [경제] "코스피 사상 최고치" → "stock market graph::bright"
- [기술] "AI 주식 투자 열풍" → "stock market technology::bright"
- [세계] "이스라엘 레바논 공습" → "war conflict destruction::dark"

Korean headline: "${title}"
Reply with ONLY the keywords::tone format, nothing else.`,
            }],
            max_tokens: 25,
            temperature: 0,
        }),
    })

    if (!res.ok) {
        console.log(`⚠️  Groq API 오류: ${res.status}`)
        return null
    }
    const data = await res.json()
    const raw: string = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!raw) return null

    const [keywords, tone] = raw.split('::')
    return { keywords: keywords.trim(), isDark: tone?.trim() === 'dark' }
}

const CATEGORY_FALLBACK: Record<string, string> = {
    '연예': 'entertainment stage concert',
    '스포츠': 'sports stadium field',
    '정치': 'politics building architecture',
    '사회': 'society cityscape urban',
    '경제': 'economy business skyline',
    'IT과학': 'technology abstract circuit',
    '기술': 'technology abstract circuit',
    '생활문화': 'lifestyle architecture interior',
    '세계': 'world landmark architecture',
}

async function main() {
    const searchWord = process.argv[2]
    if (!searchWord) {
        console.log('사용법: npx tsx scripts/check-image-keyword.ts "검색할 이슈 제목 일부"')
        process.exit(1)
    }

    console.log(`\n🔍 이슈 검색 중: "${searchWord}" (${isProduction ? '실서버' : '테스트'} DB)\n`)

    const { data: issues } = await supabase
        .from('issues')
        .select('id, title, category, thumbnail_urls')
        .ilike('title', `%${searchWord}%`)
        .limit(5)

    if (!issues || issues.length === 0) {
        console.log('❌ 이슈를 찾을 수 없습니다.')
        return
    }

    if (issues.length > 1) {
        console.log(`📋 ${issues.length}개 이슈 발견:\n`)
        issues.forEach((iss, i) => console.log(`  ${i + 1}. [${iss.category}] ${iss.title}`))
        console.log()
    }

    const issue = issues[0]
    console.log(`📌 이슈: ${issue.title}`)
    console.log(`   카테고리: ${issue.category}`)
    console.log(`   현재 썸네일: ${issue.thumbnail_urls?.length ?? 0}개\n`)

    console.log('🤖 Groq에게 키워드 요청 중...')
    const groqResult = await extractKeywordsAndTone(issue.title, issue.category)

    if (groqResult) {
        const toneLabel = groqResult.isDark ? '🌑 dark (grayscale 필터 적용)' : '☀️  bright (컬러)'
        console.log(`✅ Groq 키워드: "${groqResult.keywords}"`)
        console.log(`   톤: ${toneLabel}`)
    } else {
        const fallback = CATEGORY_FALLBACK[issue.category] ?? 'news'
        console.log(`⚠️  Groq 실패 → 폴백 키워드: "${fallback}" (컬러)`)
    }

    console.log('\n(이미지 재저장 없음 — 확인만)')
}

main().catch(console.error)
