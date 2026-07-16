/**
 * lib/ai/blog-post-generator.ts
 *
 * 이슈가 점화→논란중으로 전환될 때 네이버 블로그 포스팅용 콘텐츠 자동 생성
 * (generate-naver-blog-draft 크론에서 호출 — lib/naver/blog-schedule.ts로 예약된 건 처리 시점)
 *
 * - AI: Groq (무료, 배치성 작업)
 * - AI에게는 순수 텍스트(title/intro/bullets/conclusion)만 요청하고, HTML 마크업은
 *   항상 이 코드가 직접 조립한다 — AI가 만든 임의의 HTML 구조를 신뢰하지 않기 위함
 *   (외부 출처 이슈 제목이 포함되므로 escapeHtml로 이스케이프 후 삽입)
 * - 본문 말미에 왜난리 이슈 링크 삽입
 * - brief_summary(타임라인 요약)가 없는 정보 부실 이슈는 null을 반환해 포스팅을 건너뜀
 * - 헤딩·CTA 문구는 매번 고정되지 않도록 2~3개 버전 중 무작위 선택 (기계적 패턴 완화)
 */

import { callGroq } from '@/lib/ai/groq-client'
import { supabaseAdmin } from '@/lib/supabase-server'
import { escapeHtml } from '@/lib/utils/decode-html'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://whynali.com'

const CATEGORY_LABEL: Record<string, string> = {
    연예: '연예',
    스포츠: '스포츠',
    정치: '정치',
    사회: '사회',
    기술: '기술',
    경제: '경제',
    세계: '세계',
    커뮤니티: '커뮤니티',
}

export interface BlogPostResult {
    title: string
    contents: string
}

interface IssueExtra {
    topic?: string | null
    topic_description?: string | null
    brief_summary?: { intro: string; bullets: string[]; conclusion: string } | null
}

interface HeadingVariant {
    intro: string
    points: string
    outro: string
    ctaLead: string
}

const HEADING_VARIANTS: HeadingVariant[] = [
    { intro: '지금 왜 난리인가?', points: '주요 포인트', outro: '더 알아보기', ctaLead: '왜난리에서 실시간 반응과 토론을 확인해보세요.' },
    { intro: '무슨 일이 있었나?', points: '핵심만 정리하면', outro: '실시간 반응 보러가기', ctaLead: '지금 사람들이 어떻게 반응하고 있는지 왜난리에서 확인해보세요.' },
    { intro: '이슈 요약', points: '이렇게 흘러갔다', outro: '지금 어떻게 되고 있나', ctaLead: '왜난리에서 최신 타임라인과 커뮤니티 반응을 더 볼 수 있어요.' },
]

function pickHeadingVariant(): HeadingVariant {
    return HEADING_VARIANTS[Math.floor(Math.random() * HEADING_VARIANTS.length)]
}

/**
 * 이슈 정보를 바탕으로 블로그 포스트를 생성한다.
 * brief_summary(타임라인 요약)가 없으면 정보가 부실하다고 판단해 null 반환.
 */
export async function generateNaverBlogPost(
    issueId: string,
    basic: { title: string; category: string; status: string; heat_index: number | null }
): Promise<BlogPostResult | null> {
    const { data: extra } = await supabaseAdmin
        .from('issues')
        .select('topic, topic_description, brief_summary')
        .eq('id', issueId)
        .single<IssueExtra>()

    if (!extra?.brief_summary) {
        console.log(`[블로그생성] 이슈 ${issueId} — brief_summary 없음, 포스팅 건너뜀`)
        return null
    }

    const issueUrl = `${SITE_URL}/issue/${issueId}`
    const categoryLabel = CATEGORY_LABEL[basic.category] ?? basic.category
    const variant = pickHeadingVariant()

    const prompt = buildPrompt(basic, extra, categoryLabel)

    const raw = await callGroq(
        [
            {
                role: 'system',
                content:
                    '당신은 한국 트렌드 이슈를 쉽고 재미있게 정리하는 블로그 작가입니다. ' +
                    '독자가 "왜 이게 난리지?"를 바로 이해할 수 있도록 핵심만 간결하게 씁니다. ' +
                    '반드시 지시한 JSON 형식으로만 응답하세요.',
            },
            { role: 'user', content: prompt },
        ],
        { model: 'qwen/qwen3.6-27b', temperature: 0.7, max_tokens: 1500 }
    )

    return parsePost(raw, basic, extra, issueUrl, categoryLabel, variant)
}

function buildPrompt(
    basic: { title: string; category: string; status: string; heat_index: number | null },
    extra: IssueExtra,
    categoryLabel: string
): string {
    const heatLine = basic.heat_index != null ? `화력 지수: ${basic.heat_index}/100` : ''

    const summaryLines = extra.brief_summary
        ? [
              `소개: ${extra.brief_summary.intro}`,
              `핵심 포인트: ${extra.brief_summary.bullets.join(' / ')}`,
              `결론: ${extra.brief_summary.conclusion}`,
          ].join('\n')
        : ''

    const topicLine = extra.topic_description ? `배경: ${extra.topic_description}` : ''

    return `다음 이슈 정보를 바탕으로 네이버 블로그 포스트 내용을 작성해주세요.

이슈 정보:
- 제목: ${basic.title}
- 카테고리: ${categoryLabel}
- 상태: ${basic.status}
${heatLine}
${topicLine}
${summaryLines}

작성 규칙:
1. 블로그 제목: "[왜난리] " 접두사 + 이슈 핵심을 담은 20자 이내 제목
2. intro: 이슈 핵심 설명 3~4문장 (일반 텍스트, 마크업 금지)
3. bullets: 핵심 포인트 3가지 (각각 한 문장, 일반 텍스트)
4. conclusion: 마무리 한 문장 (일반 텍스트, 생략 가능)
5. 특정인 실명 직접 언급 자제
6. 쉽고 구어체에 가까운 문체
7. HTML 태그나 마크업은 절대 포함하지 말 것 — 순수 텍스트로만 작성

JSON 형식으로만 응답:
{
  "title": "블로그 포스트 제목",
  "intro": "소개 문단",
  "bullets": ["포인트1", "포인트2", "포인트3"],
  "conclusion": "마무리 한 문장"
}`
}

/**
 * intro/bullets/conclusion 텍스트를 고정 템플릿(변주 포함)에 조립해 최종 HTML을 만든다.
 * AI가 만든 임의의 HTML을 신뢰하지 않고, 텍스트만 받아 여기서 직접 마크업을 구성 —
 * 이슈 제목·요약 텍스트가 외부(뉴스·커뮤니티) 출처라 반드시 escapeHtml을 거쳐야 한다.
 */
function buildContents(
    issueTitle: string,
    issueUrl: string,
    variant: HeadingVariant,
    intro: string,
    bullets: string[],
    conclusion: string
): string {
    const pointsHtml = bullets.length
        ? `<ul>${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
        : ''

    return [
        `<h2>${variant.intro}</h2><p>${escapeHtml(intro)}</p>`,
        pointsHtml ? `<h2>${variant.points}</h2>${pointsHtml}` : '',
        conclusion ? `<p>${escapeHtml(conclusion)}</p>` : '',
        `<h2>${variant.outro}</h2><p>${variant.ctaLead}<br><a href="${issueUrl}">[왜난리] ${escapeHtml(issueTitle)} 이슈 바로가기 →</a></p>`,
    ].filter(Boolean).join('')
}

function parsePost(
    raw: string,
    basic: { title: string; category: string },
    extra: IssueExtra,
    issueUrl: string,
    categoryLabel: string,
    variant: HeadingVariant
): BlogPostResult {
    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('JSON 없음')

        const parsed = JSON.parse(jsonMatch[0]) as {
            title?: string
            intro?: string
            bullets?: string[]
            conclusion?: string
        }

        const title = (parsed.title ?? '').trim()
        const intro = (parsed.intro ?? '').trim()
        const bullets = (parsed.bullets ?? []).map(b => b.trim()).filter(Boolean)

        if (!title || !intro) throw new Error('필드 누락')

        return {
            title,
            contents: buildContents(basic.title, issueUrl, variant, intro, bullets, (parsed.conclusion ?? '').trim()),
        }
    } catch {
        // AI 실패 시 brief_summary를 그대로 활용한 폴백 포스트 (정보가 있으니 성의 있게 구성)
        const summary = extra.brief_summary
        const intro = summary?.intro ?? `${categoryLabel} 분야에서 화제가 된 이슈입니다.`
        const bullets = summary?.bullets ?? []
        const conclusion = summary?.conclusion ?? ''

        return {
            title: `[왜난리] ${basic.title}`,
            contents: buildContents(basic.title, issueUrl, variant, intro, bullets, conclusion),
        }
    }
}
