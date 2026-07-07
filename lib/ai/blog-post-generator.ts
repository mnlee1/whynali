/**
 * lib/ai/blog-post-generator.ts
 *
 * 이슈 승인 시 네이버 블로그 포스팅용 콘텐츠 자동 생성
 *
 * - AI: Groq (무료, 배치성 작업)
 * - 출력: title (블로그 포스트 제목), contents (HTML 본문)
 * - 본문 말미에 왜난리 이슈 링크 삽입
 */

import { callGroq } from '@/lib/ai/groq-client'
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
}

interface IssueExtra {
    topic?: string | null
    topic_description?: string | null
    brief_summary?: { intro: string; bullets: string[]; conclusion: string } | null
}

export async function generateNaverBlogPost(
    issueId: string,
    basic: { title: string; category: string; status: string; heat_index: number | null }
): Promise<BlogPostResult> {
    const { data: extra } = await supabaseAdmin
        .from('issues')
        .select('topic, topic_description, brief_summary')
        .eq('id', issueId)
        .single<IssueExtra>()

    const issueUrl = `${SITE_URL}/issue/${issueId}`
    const categoryLabel = CATEGORY_LABEL[basic.category] ?? basic.category

    const prompt = buildPrompt(basic, extra, issueUrl, categoryLabel)

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

    return parsePost(raw, basic.title, issueUrl, categoryLabel)
}

function buildPrompt(
    basic: { title: string; category: string; status: string; heat_index: number | null },
    extra: IssueExtra | null,
    issueUrl: string,
    categoryLabel: string
): string {
    const heatLine = basic.heat_index != null ? `화력 지수: ${basic.heat_index}/100` : ''

    const summaryLines = extra?.brief_summary
        ? [
              `소개: ${extra.brief_summary.intro}`,
              `핵심 포인트: ${extra.brief_summary.bullets.join(' / ')}`,
              `결론: ${extra.brief_summary.conclusion}`,
          ].join('\n')
        : ''

    const topicLine = extra?.topic_description ? `배경: ${extra.topic_description}` : ''

    return `다음 이슈 정보를 바탕으로 네이버 블로그 포스트를 작성해주세요.

이슈 정보:
- 제목: ${basic.title}
- 카테고리: ${categoryLabel}
- 상태: ${basic.status}
${heatLine}
${topicLine}
${summaryLines}

작성 규칙:
1. 블로그 제목: "[왜난리] " 접두사 + 이슈 핵심을 담은 20자 이내 제목
2. 본문 HTML 구성 (순서대로):
   - <h2>지금 왜 난리인가?</h2> + <p>이슈 핵심 설명 (3~4문장)</p>
   - <h2>주요 포인트</h2> + <ul><li>핵심 3가지</li></ul>
   - <h2>더 알아보기</h2> + <p>왜난리에서 실시간 반응과 토론을 확인해보세요.<br><a href="${issueUrl}">[왜난리] ${basic.title} 이슈 바로가기 →</a></p>
3. 특정인 실명 직접 언급 자제
4. 쉽고 구어체에 가까운 문체

JSON 형식으로만 응답:
{
  "title": "블로그 포스트 제목",
  "contents": "HTML 본문 전체"
}`
}

function parsePost(raw: string, issueTitle: string, issueUrl: string, categoryLabel: string): BlogPostResult {
    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('JSON 없음')

        const parsed = JSON.parse(jsonMatch[0]) as { title?: string; contents?: string }

        const title = (parsed.title ?? '').trim()
        const contents = (parsed.contents ?? '').trim()

        if (!title || !contents) throw new Error('필드 누락')

        return { title, contents }
    } catch {
        // AI 실패 시 기본 포스트로 폴백
        return {
            title: `[왜난리] ${issueTitle}`,
            contents: `<h2>지금 왜 난리인가?</h2><p>${categoryLabel} 분야에서 화제가 된 이슈입니다.</p><h2>더 알아보기</h2><p>왜난리에서 실시간 반응과 토론을 확인해보세요.<br><a href="${issueUrl}">[왜난리] ${issueTitle} 이슈 바로가기 →</a></p>`,
        }
    }
}
