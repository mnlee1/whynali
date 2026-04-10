/**
 * scripts/fix-sports-issues.ts
 * 스포츠 카테고리에 섞인 연예 이슈 제거 후 진짜 스포츠 이슈 7개 추가
 */

import { config } from 'dotenv'
import Groq from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mdxshmfmcdcotteevwgi.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const GROQ_KEYS = (process.env.GROQ_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)

async function main() {
    // 스포츠 전용 키워드로 뉴스 수집
    const queries = ['KBO 야구 선수', 'K리그 축구', '배구 농구 스포츠', '스포츠 감독 논란']
    const headlines: string[] = []

    for (const q of queries) {
        const res = await fetch(
            `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=30&sort=sim`,
            {
                headers: {
                    'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
                    'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
                },
            }
        )
        const data = await res.json()
        const items = (data.items ?? []).map((i: { title: string }) =>
            i.title.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
        )
        headlines.push(...items)
    }

    console.log(`뉴스 수집: ${headlines.length}건`)

    // Groq AI로 순수 스포츠 이슈 7개 생성
    const groq = new Groq({ apiKey: GROQ_KEYS[0] })
    const prompt = `당신은 한국 스포츠 뉴스 편집자입니다.

아래 헤드라인에서 야구(KBO), 축구(K리그/국가대표), 배구, 농구, 골프 등 순수 스포츠 이슈만 골라 7개 선정해주세요.
연예인·방송·아이돌 관련은 절대 포함하지 마세요.

조건:
- 제목 15~35자
- status: 점화 또는 논란중
- heat: 35~90

헤드라인:
${headlines.slice(0, 80).map((h, i) => `${i + 1}. ${h}`).join('\n')}

JSON 배열만 출력:
[{"title":"","status":"점화","heat":70}]`

    const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 3000,
    })

    const content = res.choices[0]?.message?.content ?? ''
    const match = content.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('JSON 파싱 실패:\n' + content)

    const issues = JSON.parse(match[0])
    console.log('\n생성된 이슈:')
    issues.forEach((i: { status: string; heat: number; title: string }) =>
        console.log(`  [${i.status}|${i.heat}] ${i.title}`)
    )

    const rows = issues.map((i: { title: string; status: string; heat: number }) => ({
        title: i.title,
        status: i.status,
        category: '스포츠',
        heat_index: i.heat,
        created_heat_index: i.heat,
        approval_status: '승인',
        approval_type: 'manual',
        visibility_status: 'visible',
        source_track: 'track_a',
        approved_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase.from('issues').insert(rows).select('id')
    if (error) throw new Error('삽입 실패: ' + error.message)

    console.log(`\n✅ ${data?.length}개 삽입 완료`)

    // 최종 스포츠 현황
    const { data: final } = await supabase
        .from('issues')
        .select('title, status, heat_index')
        .eq('category', '스포츠')
        .eq('approval_status', '승인')
        .order('created_at', { ascending: false })

    console.log('\n📊 최종 스포츠 이슈:')
    final?.forEach(i => console.log(`  [${i.status}|${i.heat_index}] ${i.title}`))
}

main().catch(err => { console.error('❌', err); process.exit(1) })
