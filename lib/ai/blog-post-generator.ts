/**
 * lib/ai/blog-post-generator.ts
 *
 * 이슈가 점화→논란중으로 전환될 때 네이버 블로그 포스팅용 콘텐츠 자동 생성
 * (generate-naver-blog-draft 크론에서 호출 — lib/naver/blog-schedule.ts로 예약된 건 처리 시점)
 *
 * - AI: Gemini (whynali blog AI 프로젝트 전용 키, 무료 등급 — 다른 기능과 할당량 분리됨)
 *   Groq의 만성적인 rate limit(하루 실패율 14~46%, thinking 모델 토큰 소모 문제)를
 *   피하기 위해 채택. gemini-3.5-flash-lite 고정 사용 (타임라인 요약과 동일 모델,
 *   단 프로젝트/키는 별도라 할당량은 안 겹침 — lib/ai/gemini-provider.ts 참고)
 * - 팩트체크: 이슈에 연결된 news_data(제목/날짜/출처)를 근거자료로 프롬프트에 첨부해
 *   본문의 날짜·수치·발언이 실제 수집된 뉴스와 어긋나지 않도록 유도한다
 *   (기사 본문까지는 저장돼 있지 않아 "헤드라인·날짜 대조" 수준의 검증이다)
 * - 문체는 "~다"체(저널리즘 톤) — 사이트 전반의 해요체 UX라이팅 가이드와는 별개로
 *   블로그 포스트 전용으로 적용한다
 * - 네이버 블로그에 복사·붙여넣기만 하면 되도록 HTML이 아닌 순수 텍스트로 조립한다
 *   (이모지·구분선으로 섹션을 구분, 마크다운 기호는 쓰지 않는다)
 * - brief_summary(타임라인 요약)가 없는 정보 부실 이슈는 null을 반환해 포스팅을 건너뜀
 * - 헤딩·CTA 문구는 매번 고정되지 않도록 2~3개 버전 중 무작위 선택 (기계적 패턴 완화)
 * - 대표 이미지는 순수 텍스트에 인라인으로 넣을 수 없어 본문에서 제외 — 관리자 화면에서
 *   이슈 자체의 썸네일(thumbnail_urls)을 별도로 보여주고 수동으로 첨부하게 한다
 */

import { callGeminiBlog } from '@/lib/ai/gemini-client'
import { supabaseAdmin } from '@/lib/supabase-server'

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
    tags: string[]
}

interface IssueExtra {
    topic?: string | null
    topic_description?: string | null
    brief_summary?: { intro: string; bullets: string[]; conclusion: string } | null
}

interface NewsFactRow {
    title: string | null
    source: string | null
    published_at: string | null
}

interface HeadingVariant {
    intro: string
    points: string
    closing: string
    outro: string
    ctaLead: string
}

// 소제목은 고정 변주(질문형으로 궁금증 유발), 본문 텍스트는 AI가 "~다"체로 작성
const HEADING_VARIANTS: HeadingVariant[] = [
    { intro: '무슨 일이 있었나?', points: '핵심만 정리하면', closing: '그래서, 결론은 뭘까?', outro: '실시간 반응 보러가기', ctaLead: '왜난리에서 실시간 반응과 토론을 확인해보세요.' },
    { intro: '무슨 일인가?', points: '이렇게 흘러갔다', closing: '이대로 끝나는 걸까?', outro: '지금 반응 확인하기', ctaLead: '지금 사람들이 어떻게 반응하고 있는지 왜난리에서 확인해보세요.' },
    { intro: '지금 무슨 일이 벌어지고 있나?', points: '핵심 포인트', closing: '앞으로 어떻게 될까?', outro: '실시간 타임라인 보기', ctaLead: '왜난리에서 최신 타임라인과 커뮤니티 반응을 더 볼 수 있어요.' },
]

// 네이버 에디터 태그란은 붙여넣기로 한 번에 등록이 안 되고 하나씩 입력해야 해서,
// 관리자가 매번 손으로 채우는 태그 수를 최소화한다 — 브랜드 고정 태그 3개 + 카테고리 1개 +
// 이슈별 AI 생성 태그만 붙인다.
const FIXED_TAGS = ['왜난리', '이슈', '논란']

// 순수 텍스트 조립용 구분선·번호 이모지
const DIVIDER = '─'.repeat(20)
const BULLET_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣']

function pickHeadingVariant(): HeadingVariant {
    return HEADING_VARIANTS[Math.floor(Math.random() * HEADING_VARIANTS.length)]
}

/** AI/폴백이 만든 태그에 고정 태그를 더하고 중복을 제거한다. */
function withFixedTags(tags: string[]): string[] {
    const merged = [...tags, ...FIXED_TAGS]
    return [...new Set(merged)]
}

/** AI가 준 emoji 필드를 방어적으로 정리 — 비어있으면 기본 이모지로 대체 */
function sanitizeEmoji(raw?: string): string {
    const trimmed = (raw ?? '').trim()
    if (!trimmed) return '📰'
    // 결합 이모지(ZWJ 시퀀스 등) 고려해 앞부분 몇 코드포인트만 사용
    return Array.from(trimmed).slice(0, 4).join('')
}

/** news_data 조회 결과를 "날짜 | 출처 | 제목" 목록 텍스트로 만든다 (팩트체크 근거자료). */
function buildNewsFactsBlock(rows: NewsFactRow[]): string {
    if (!rows.length) return '(수집된 뉴스 없음)'
    return rows
        .map(r => {
            const date = r.published_at ? r.published_at.slice(0, 10) : '날짜미상'
            return `- ${date} | ${r.source ?? '출처미상'} | ${r.title ?? ''}`
        })
        .join('\n')
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

    // 네이버 블로그발 유입을 검색 유입과 구분해서 집계하기 위한 UTM 파라미터 (lib/kpi/calculator.ts 참고)
    const issueUrl = `${SITE_URL}/issue/${issueId}?utm_source=naver_blog`
    const categoryLabel = CATEGORY_LABEL[basic.category] ?? basic.category
    const variant = pickHeadingVariant()

    const { data: newsRows } = await supabaseAdmin
        .from('news_data')
        .select('title, source, published_at')
        .eq('issue_id', issueId)
        .order('published_at', { ascending: false })
        .limit(15)

    const newsFactsBlock = buildNewsFactsBlock(newsRows ?? [])

    const prompt = buildPrompt(basic, extra, categoryLabel, newsFactsBlock)

    const raw = await callGeminiBlog(
        [
            {
                role: 'system',
                content:
                    '당신은 네이버 블로그 검색 노출을 고려해 글을 쓰는, 한국 트렌드 이슈 전문 블로그 마케터입니다. ' +
                    '독자가 "왜 이게 난리지?"를 바로 이해할 수 있도록 충분히 상세하고 읽을 만한 분량으로 씁니다. ' +
                    '제공된 뉴스 목록에 없는 사실은 단정하지 않고, 반드시 지시한 JSON 형식으로만 응답하세요.',
            },
            { role: 'user', content: prompt },
        ],
        { model: 'gemini-3.5-flash-lite', temperature: 0.7, max_tokens: 2500, jsonMode: true }
    )

    return parsePost(raw, basic, extra, issueUrl, categoryLabel, variant)
}

function buildPrompt(
    basic: { title: string; category: string; status: string; heat_index: number | null },
    extra: IssueExtra,
    categoryLabel: string,
    newsFactsBlock: string
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
이 글은 네이버 블로그 검색 노출(SEO)을 목표로 하는 마케팅용 포스트입니다.

이슈 정보:
- 제목: ${basic.title}
- 카테고리: ${categoryLabel}
- 상태: ${basic.status}
${heatLine}
${topicLine}
${summaryLines}

실제로 수집된 뉴스 목록(날짜 | 출처 | 제목) — 팩트체크 근거자료입니다. 본문의 날짜·수치·발언이 이 목록과 다르면 목록 기준으로 바로잡고, 목록에 없는 내용은 사실인 것처럼 단정하지 마세요:
${newsFactsBlock}

작성 규칙:
1. title: 사람들이 실제로 검색할 만한 핵심 키워드(사건·행사명 등)를 자연스럽게 포함한 20자 이내 제목. "[왜난리 이슈]" 같은 접두사는 붙이지 마세요(코드에서 별도로 붙입니다).
2. emoji: 제목 내용과 어울리는 이모지 1개. 너무 자극적이거나 부적절한 이모지는 피하세요.
3. introLines: 이슈 핵심 설명을 5~7개의 문장으로 나눠 배열로 작성(각 항목이 한 문장) — 검색 노출을 고려해 핵심 키워드를 1~2회 자연스럽게 반복하고, 마지막 문장은 궁금증을 남기는 문장으로 마무리
4. bullets: 핵심 포인트 4~5가지(각각 한 문장, 구체적으로)
5. closingLines: 마무리 문장 2~3개 배열 — 아직 확정되지 않은 부분은 단정하지 말고 여운을 남기는 문장으로
6. tags: 검색에 도움될 키워드 태그 5~8개(예: 이슈 관련 사건명·분야명·유행어 등, 각 태그는 공백 없이 간결하게)
7. 특정인 실명 직접 언급 자제
8. 문체는 아래 규칙을 반드시 따를 것:
   - 모든 문장을 "~다"체로 쓸 것(해요체·합니다체 금지 — 예: "일어났어요"(X) → "일어났다"(O), "논란인가요"(X) → "논란인가"(O))
   - 능동형으로 쓸 것(예: "발표되었다"(X) → "발표했다"(O))
   - 근거가 확실하지 않은 내용은 단정하지 말고 "~로 보인다", "~라는 분석이 나온다", "~라는 관측이 나온다" 등으로 부드럽게 표현할 것
   - 비난조 대신 사실 위주로 서술할 것
9. 전체 분량은 800~1200자 목표로 충분히 상세하게
10. HTML 태그나 마크다운 기호(#, *, - 등)는 절대 포함하지 말 것 — 순수 텍스트로만 작성

JSON 형식으로만 응답:
{
  "emoji": "🐹",
  "title": "블로그 포스트 제목",
  "introLines": ["문장1", "문장2", "문장3", "문장4"],
  "bullets": ["포인트1", "포인트2", "포인트3", "포인트4"],
  "closingLines": ["문장1", "문장2"],
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}`
}

/**
 * emoji/헤드라인/문장 배열을 고정 템플릿(변주 포함)에 조립해 최종 순수 텍스트를 만든다.
 * 네이버 블로그에 그대로 복사·붙여넣기 하는 용도라 HTML·마크다운 없이 이모지와
 * 구분선(DIVIDER)만으로 섹션을 나눈다.
 */
function buildContents(
    emoji: string,
    headline: string,
    variant: HeadingVariant,
    introLines: string[],
    bullets: string[],
    closingLines: string[],
    issueTitle: string,
    issueUrl: string
): string {
    const bulletsText = bullets.map((b, i) => `${BULLET_EMOJIS[i] ?? `${i + 1}.`} ${b}`).join('\n')

    return [
        `${emoji} ${headline}`,
        '',
        variant.intro,
        introLines.join('\n'),
        '',
        DIVIDER,
        '',
        `📌 ${variant.points}`,
        bulletsText,
        '',
        DIVIDER,
        '',
        variant.closing,
        closingLines.join('\n'),
        '',
        DIVIDER,
        '',
        `🔥 ${variant.outro}`,
        variant.ctaLead,
        `[왜난리 이슈] ${issueTitle} 바로가기 → ${issueUrl}`,
    ].join('\n')
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
            emoji?: string
            title?: string
            introLines?: string[]
            bullets?: string[]
            closingLines?: string[]
            tags?: string[]
        }

        const title = (parsed.title ?? '').trim()
        const emoji = sanitizeEmoji(parsed.emoji)
        const introLines = (parsed.introLines ?? []).map(s => s.trim()).filter(Boolean)
        const bullets = (parsed.bullets ?? []).map(b => b.trim()).filter(Boolean)
        const closingLines = (parsed.closingLines ?? []).map(s => s.trim()).filter(Boolean)
        const tags = (parsed.tags ?? []).map(t => t.trim().replace(/\s+/g, '')).filter(Boolean)

        if (!title || !introLines.length) throw new Error('필드 누락')

        return {
            title: `[왜난리 이슈] ${title}`,
            contents: buildContents(emoji, title, variant, introLines, bullets, closingLines, basic.title, issueUrl),
            tags: withFixedTags([categoryLabel, ...tags]),
        }
    } catch {
        // AI 실패 시 brief_summary를 그대로 활용한 폴백 포스트 (정보가 있으니 성의 있게 구성)
        const summary = extra.brief_summary
        const introLines = summary?.intro ? [summary.intro] : [`${categoryLabel} 분야에서 화제가 된 이슈다.`]
        const bullets = summary?.bullets ?? []
        const closingLines = summary?.conclusion ? [summary.conclusion] : []

        return {
            title: `[왜난리 이슈] ${basic.title}`,
            contents: buildContents('📰', basic.title, variant, introLines, bullets, closingLines, basic.title, issueUrl),
            tags: withFixedTags([categoryLabel]),
        }
    }
}
