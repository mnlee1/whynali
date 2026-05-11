/**
 * app/api/test/pollinations/route.ts
 *
 * Pollinations.ai 이미지 생성 테스트
 * - API 키 불필요, 완전 무료
 * - Groq로 키워드 추출 후 이미지 생성 URL 반환
 *
 * GET /api/test/pollinations
 */

import { NextResponse } from 'next/server'

const TEST_ISSUES = [
    { title: '손흥민 골든부트 수상', category: '스포츠' },
    { title: '배우 음주운전 적발', category: '연예' },
    { title: '코스피 사상 최고치 돌파', category: '경제' },
    { title: '이스라엘 공습 사망자 급증', category: '세계' },
    { title: 'AI 스타트업 투자 열풍', category: '기술' },
    { title: '카페 창업 열풍', category: '생활문화' },
]

const CATEGORY_FALLBACK: Record<string, string> = {
    '연예': 'stage spotlight neon',
    '스포츠': 'stadium lights aerial',
    '정치': 'marble columns government',
    '사회': 'city street urban blur',
    '경제': 'financial skyline glass',
    'IT과학': 'server room digital blue',
    '기술': 'server room digital blue',
    '생활문화': 'cafe interior warm light',
    '세계': 'ocean horizon earth',
}

async function extractKeywords(title: string, category: string): Promise<string> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) return CATEGORY_FALLBACK[category] ?? 'news background'

    const cleanTitle = title.replace(/^\[.*?\]\s*/, '').trim()

    try {
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
                    content: `Convert this Korean news headline into 3-5 English keywords for AI image generation.
Focus on visual atmosphere and setting. No people or faces.
Reply ONLY with the keywords, nothing else.
Category: ${category}
Headline: "${cleanTitle}"`,
                }],
                max_tokens: 30,
                temperature: 0,
            }),
        })
        if (!res.ok) return CATEGORY_FALLBACK[category] ?? 'news background'
        const data = await res.json()
        return data.choices?.[0]?.message?.content?.trim() ?? CATEGORY_FALLBACK[category] ?? 'news background'
    } catch {
        return CATEGORY_FALLBACK[category] ?? 'news background'
    }
}

function buildPollinationsUrl(prompt: string): string {
    const encoded = encodeURIComponent(`${prompt}, cinematic, high quality, no people, no text`)
    return `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&nologo=true&seed=${Math.floor(Math.random() * 99999)}`
}

export async function GET() {
    const results: Array<{ title: string; category: string; keyword: string; imageUrl: string }> = []

    for (const issue of TEST_ISSUES) {
        const keyword = await extractKeywords(issue.title, issue.category)
        const imageUrl = buildPollinationsUrl(keyword)
        results.push({ title: issue.title, category: issue.category, keyword, imageUrl })
        await new Promise(r => setTimeout(r, 500))
    }

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>Pollinations.ai 테스트</title>
  <style>
    body { font-family: sans-serif; background: #111; color: #eee; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 24px; color: #fff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 24px; }
    .card { background: #1e1e1e; border-radius: 12px; overflow: hidden; }
    .card img { width: 100%; height: 280px; object-fit: cover; display: block; background: #333; }
    .info { padding: 12px 16px; }
    .title { font-size: 15px; font-weight: bold; margin-bottom: 4px; }
    .keyword { font-size: 12px; color: #888; }
    .badge { display: inline-block; font-size: 11px; background: #333; border-radius: 4px; padding: 2px 7px; margin-right: 6px; color: #aaa; }
  </style>
</head>
<body>
  <h1>Pollinations.ai 이미지 품질 테스트</h1>
  <p style="color:#888; font-size:13px; margin-bottom:24px;">이미지 로딩에 10~20초 소요될 수 있습니다.</p>
  <div class="grid">
    ${results.map(r => `
    <div class="card">
      <img src="${r.imageUrl}" alt="${r.title}" loading="lazy" />
      <div class="info">
        <div class="title">${r.title}</div>
        <div class="keyword">
          <span class="badge">${r.category}</span>
          키워드: ${r.keyword}
        </div>
      </div>
    </div>`).join('')}
  </div>
</body>
</html>`

    return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
}
