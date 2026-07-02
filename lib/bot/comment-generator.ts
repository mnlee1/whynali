import { callGroq } from '@/lib/ai/groq-client'
import type { BotPersona } from './personas'

const BOT_GROQ_MODEL = 'openai/gpt-oss-120b'

export interface IssueContext {
    title: string
    category: string
    heat_index?: number | null
}

function heatDescription(heat?: number | null): string {
    if (heat == null) return ''
    if (heat >= 70) return '매우 화제인'
    if (heat >= 30) return '꽤 활발한'
    return '조용한'
}

const ARTIFACT_RE = /<\|.*?\|>|assistant\s*$/i
// 한글(음절·자모) + ASCII(숫자·구두점 포함) 외 문자 포함 시 폐기 — 베트남어·태국어·아랍어·한자 등 일괄 차단
const FOREIGN_CHAR_RE = /[^가-힣ᄀ-ᇿ㄰-㆏\x00-\x7F]/

function sanitizeBotComment(raw: string): string | null {
    let text = raw.split(/<\|start_header_id\|>/)[0].trim()
    text = text.replace(/^["'`]|["'`]$/g, '').trim()
    if (FOREIGN_CHAR_RE.test(text)) return null
    if (ARTIFACT_RE.test(text)) return null
    if (text.length < 15 || text.length > 200) return null
    // 한글 음절이 비공백 문자의 40% 미만이면 ASCII 외국어 단어 섞인 것으로 판단, 폐기
    const noSpace = text.replace(/\s/g, '')
    if (noSpace.length > 0) {
        const hangulCount = (noSpace.match(/[가-힣]/g) ?? []).length
        if (hangulCount / noSpace.length < 0.4) return null
    }
    return text
}

export interface DiscussionContext {
    body: string
    issue_title?: string | null
    issue_category?: string | null
}

async function callWithFallback(persona: BotPersona, prompt: string): Promise<string | null> {
    const messages = [
        { role: 'system' as const, content: persona.systemPrompt },
        { role: 'user' as const, content: prompt },
    ]
    const opts = { temperature: 0.85, max_tokens: 150 }

    try {
        const raw = await callGroq(messages, { ...opts, model: BOT_GROQ_MODEL })
        const cleaned = sanitizeBotComment(raw)
        if (cleaned) return cleaned
    } catch {
        // Groq 실패 시 댓글 생성 건너뜀
    }

    return null
}

export async function generateBotDiscussionComment(
    persona: BotPersona,
    topic: DiscussionContext
): Promise<string | null> {
    const prompt = `다음 토론 주제에 대한 의견을 한 개 작성해주세요.

토론 주제: ${topic.body}
${topic.issue_title ? `관련 이슈: ${topic.issue_title}` : ''}${topic.issue_category ? `\n카테고리: ${topic.issue_category}` : ''}

규칙:
- 30자 이상 120자 이하의 자연스러운 한국어 의견
- 토론 주제에 대한 자신의 입장이나 생각을 구어체로
- 특정인 실명, 혐오 표현, 욕설 절대 금지
- 마크다운·JSON 없이 의견 텍스트만 반환`

    return callWithFallback(persona, prompt)
}

export async function generateBotComment(
    persona: BotPersona,
    issue: IssueContext
): Promise<string | null> {
    const heatDesc = heatDescription(issue.heat_index)

    const prompt = `다음 이슈에 대한 댓글 한 개를 작성해주세요.

이슈 제목: ${issue.title}
카테고리: ${issue.category}${heatDesc ? `\n현재 반응: ${heatDesc} 이슈` : ''}

규칙:
- 30자 이상 120자 이하의 자연스러운 한국어 댓글
- 실제 커뮤니티 사용자가 쓴 것처럼 구어체로
- 특정인 실명, 혐오 표현, 욕설 절대 금지
- 마크다운·JSON 없이 댓글 텍스트만 반환`

    return callWithFallback(persona, prompt)
}
