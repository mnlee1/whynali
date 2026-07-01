/**
 * scripts/test-bot-discussion.ts
 *
 * 봇 토론 의견 품질 테스트 (DB 기록 없음, 읽기 전용)
 * 실행: npx tsx scripts/test-bot-discussion.ts
 * 옵션: --topic-id=<UUID>  특정 토론 지정 (없으면 최근 진행중 토론 3개 자동)
 */

import 'dotenv/config'
import { resolve } from 'path'

import dotenv from 'dotenv'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import Anthropic from '@anthropic-ai/sdk'

// ── 페르소나 정의 ──
const PERSONAS = [
    {
        displayName: '영리한여우3842',
        type: '분석형',
        systemPrompt: `당신은 데이터와 숫자에 밝은 한국인 커뮤니티 사용자입니다.
이슈를 보면 "저번에도 이랬는데", "숫자로 보면", "이게 핵심인데" 같은 말버릇이 있습니다.
댓글 작성 규칙:
- 반드시 1~2문장, 60자 이하
- 이슈의 구체적 수치·시점·비교 중 하나를 콕 짚기
- 글자 중간에 외국어·특수문자 절대 금지
- 마크다운 없이 텍스트만
좋은 예시: "1550원이면 2022년 고점이랑 비슷한 수준이네. 그때도 이렇게 올랐다가 확 빠졌는데."
나쁜 예시: "이 이슈는 여러 관점에서 분석할 수 있습니다."`,
    },
    {
        displayName: '포근한수달7691',
        type: '공감형',
        systemPrompt: `당신은 감정이 풍부한 한국인 커뮤니티 사용자입니다.
이슈를 보고 든 첫 감정을 바로 내뱉는 스타일이에요.
댓글 작성 규칙:
- 반드시 1~2문장, 50자 이하
- 감정 반응 위주 (놀람·안타까움·분노·기쁨 중 하나)
- "진짜", "ㅠㅠ", "와", "헐", "대박", "맞아" 같은 표현 자연스럽게 활용
- 글자 중간에 외국어·특수문자 절대 금지
- 마크다운 없이 텍스트만
좋은 예시: "진짜 이게 말이 됨?? 이러다 물가 다 올라버리는 거 아니야ㅠㅠ"
나쁜 예시: "환율이 오르는 상황에 많은 사람들이 걱정하고 있을 것 같습니다."`,
    },
    {
        displayName: '느긋한부엉이2503',
        type: '정보형',
        systemPrompt: `당신은 배경 지식을 자연스럽게 나누는 한국인 커뮤니티 사용자입니다.
"이거 알고 보면", "사실 이 이슈 배경엔", "관련 맥락을 말하면" 같은 스타일로 씁니다.
댓글 작성 규칙:
- 반드시 1~2문장, 70자 이하
- 이슈와 관련된 배경·원인·맥락 한 가지만 구체적으로 언급
- 강의·설명 말고 "말해주는 친구" 톤
- 글자 중간에 외국어·특수문자 절대 금지
- 마크다운 없이 텍스트만
좋은 예시: "이거 사실 미국 금리 인상이랑 엮여 있어서 단기간 안에 안 잡힐 가능성 높음."
나쁜 예시: "환율은 다양한 국제 경제 요인에 의해 결정되는 복잡한 지표입니다."`,
    },
    {
        displayName: '당당한늑대8174',
        type: '비판형',
        systemPrompt: `당신은 냉정하게 다른 시각을 제시하는 한국인 커뮤니티 사용자입니다.
"근데 솔직히", "그렇게 보면", "반대로 생각하면" 같은 말로 반론이나 냉정한 시각을 냅니다.
댓글 작성 규칙:
- 반드시 1~2문장, 60자 이하
- 이슈의 반대편 시각 또는 간과되는 부분 하나 짚기
- 공격·욕설 없이 논리적으로
- 글자 중간에 외국어·특수문자 절대 금지
- 마크다운 없이 텍스트만
좋은 예시: "근데 솔직히 수출 기업 입장에서는 오히려 환율 오르는 게 나쁜 건 아니잖아."
나쁜 예시: "솔직히 이건 단순히 좋다 나쁘다로 볼 수 없는 복잡한 상황입니다."`,
    },
    {
        displayName: '엉뚱한햄스터4926',
        type: '궁금형',
        systemPrompt: `당신은 궁금한 것을 바로 물어보는 한국인 커뮤니티 사용자입니다.
"이게 맞는 건가?", "근데 왜 ~인 거야?", "나만 이게 이상하게 느껴짐?" 스타일로 씁니다.
댓글 작성 규칙:
- 반드시 1~2문장, 50자 이하
- 이슈에서 진짜 궁금한 부분 하나를 솔직하게 질문
- 거창한 질문 말고 "나 진짜 몰라서 물어보는" 느낌
- 글자 중간에 외국어·특수문자 절대 금지
- 마크다운 없이 텍스트만
좋은 예시: "근데 환율이 오르면 수출은 오히려 좋은 거 아닌가? 뭔가 복잡한 거야?"
나쁜 예시: "이 문제에 대해 더 많은 정보가 필요하다고 생각합니다."`,
    },
]

// ── 후처리 필터 ──
const FOREIGN_CHAR_RE = /[^가-힣ᄀ-ᇿ㄰-㆏\x00-\x7F]/
function sanitize(raw: string): string | null {
    let text = raw.split(/<\|start_header_id\|>/)[0].trim()
    text = text.replace(/^["'`]|["'`]$/g, '').trim()
    if (FOREIGN_CHAR_RE.test(text)) return null
    if (/<\|.*?\|>|assistant\s*$/i.test(text)) return null
    if (text.length < 15 || text.length > 200) return null
    const noSpace = text.replace(/\s/g, '')
    if (noSpace.length > 0) {
        const hangulCount = (noSpace.match(/[가-힣]/g) ?? []).length
        if (hangulCount / noSpace.length < 0.4) return null
    }
    return text
}

// ── 콘솔 컬러 ──
const R = '\x1b[0m'
const B = '\x1b[1m'
const C = '\x1b[36m'
const Y = '\x1b[33m'
const G = '\x1b[32m'
const D = '\x1b[2m'
const M = '\x1b[35m'

function header(text: string) {
    console.log(`\n${B}${M}${'─'.repeat(64)}${R}`)
    console.log(`${B}${M}  ${text}${R}`)
    console.log(`${M}${'─'.repeat(64)}${R}`)
}

async function generateDiscussionComment(
    groqKeys: string[],
    persona: (typeof PERSONAS)[0],
    topic: { body: string; issue_title?: string | null; issue_category?: string | null },
    anthropicKey?: string
): Promise<string | null> {
    const prompt = `다음 토론 주제에 대한 의견을 한 개 작성해주세요.

토론 주제: ${topic.body}
${topic.issue_title ? `관련 이슈: ${topic.issue_title}` : ''}${topic.issue_category ? `\n카테고리: ${topic.issue_category}` : ''}

규칙:
- 30자 이상 120자 이하의 자연스러운 한국어 의견
- 토론 주제에 대한 자신의 입장이나 생각을 구어체로
- 특정인 실명, 혐오 표현, 욕설 절대 금지
- 마크다운·JSON 없이 의견 텍스트만 반환`

    const MODELS = ['qwen/qwen3.6-27b', 'openai/gpt-oss-120b']
    for (const model of MODELS) {
        for (const apiKey of groqKeys) {
            try {
                const groq = new Groq({ apiKey })
                const res = await groq.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: persona.systemPrompt },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.85,
                    max_tokens: 150,
                })
                const text = res.choices[0]?.message?.content?.trim() ?? ''
                const cleaned = sanitize(text)
                if (cleaned) {
                    process.stdout.write(`${D}(${model.split('/').pop()})${R} `)
                    return cleaned
                }
            } catch {
                // 다음 키/모델 시도
            }
        }
    }

    if (anthropicKey) {
        try {
            const anthropic = new Anthropic({ apiKey: anthropicKey })
            const res = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 150,
                system: persona.systemPrompt,
                messages: [{ role: 'user', content: prompt }],
            })
            const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
            const cleaned = sanitize(text)
            if (cleaned) {
                process.stdout.write(`${D}(claude-haiku)${R} `)
                return cleaned
            }
        } catch (e) {
            console.error(`    \x1b[31mClaude 오류: ${e instanceof Error ? e.message : String(e)}\x1b[0m`)
        }
    }

    process.stderr.write(`    \x1b[31m오류: 모든 AI 키·모델 한도 소진\x1b[0m\n`)
    return null
}

async function main() {
    const args = process.argv.slice(2)
    const topicIdArg = args.find((a) => a.startsWith('--topic-id='))?.split('=')[1]

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const groqKey = process.env.GROQ_API_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY

    if (!supabaseUrl || !serviceKey) {
        console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
        process.exit(1)
    }
    if (!groqKey && !anthropicKey) {
        console.error('GROQ_API_KEY 또는 ANTHROPIC_API_KEY 중 하나가 필요합니다.')
        process.exit(1)
    }

    const supabase = createClient(supabaseUrl, serviceKey)
    const groqKeys = groqKey ? groqKey.split(',').map((k) => k.trim()).filter(Boolean) : []

    console.log(`\n${B}왜난리 봇 토론 의견 품질 테스트${R}`)
    console.log(`${D}페르소나 5개 × 토론 최대 3개 — DB 기록 없음${R}`)

    // 테스트 토론 조회
    type TopicRow = {
        id: string
        body: string
        issues: { title: string; category: string } | null
    }
    let topics: TopicRow[] = []

    if (topicIdArg) {
        const { data } = await supabase
            .from('discussion_topics')
            .select('id, body, issues(title, category)')
            .eq('id', topicIdArg)
            .single()
        if (data) topics = [data as unknown as TopicRow]
    } else {
        const { data } = await supabase
            .from('discussion_topics')
            .select('id, body, issues(title, category)')
            .eq('approval_status', '진행중')
            .order('created_at', { ascending: false })
            .limit(3)
        topics = (data ?? []) as unknown as TopicRow[]
    }

    if (topics.length === 0) {
        console.log(`\n${Y}진행중 토론이 없습니다. '대기' 상태 토론도 확인합니다...${R}`)
        const { data } = await supabase
            .from('discussion_topics')
            .select('id, body, issues(title, category)')
            .order('created_at', { ascending: false })
            .limit(3)
        topics = (data ?? []) as unknown as TopicRow[]

        if (topics.length === 0) {
            console.error('토론 주제가 없습니다. --topic-id=<UUID> 로 직접 지정하세요.')
            process.exit(1)
        }
        console.log(`${D}(최근 토론 ${topics.length}개로 테스트)${R}`)
    }

    for (const topic of topics) {
        const issueInfo = topic.issues
        const label = topic.body.length > 50 ? topic.body.slice(0, 50) + '...' : topic.body
        header(label)
        if (issueInfo) {
            console.log(`${D}관련 이슈: ${issueInfo.title}  [${issueInfo.category}]${R}\n`)
        } else {
            console.log(`${D}(관련 이슈 없음)${R}\n`)
        }

        for (const persona of PERSONAS) {
            process.stdout.write(`  ${Y}[${persona.type}] ${B}${persona.displayName}${R}  `)
            const comment = await generateDiscussionComment(
                groqKeys,
                persona,
                {
                    body: topic.body,
                    issue_title: issueInfo?.title,
                    issue_category: issueInfo?.category,
                },
                anthropicKey
            )
            if (comment) {
                console.log(`${G}${comment}${R}`)
            } else {
                console.log(`\x1b[31m생성 실패${R}`)
            }
        }
    }

    console.log(`\n${D}완료. 실제 DB에 기록된 내용 없음.${R}\n`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
