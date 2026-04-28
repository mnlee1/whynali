/**
 * lib/ai/generate-timeline-summary.ts
 *
 * 이슈 타임라인 AI 요약 생성 — update-timeline cron과 어드민 백필에서 공용으로 사용
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'

const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과', '이나', '나',
    '도', '만', '까지', '부터', '에서', '에게', '한테', '한', '하는', '하고', '하여', '해서',
    '이다', '있다', '없다', '하다', '되다', '이고', '하며', '에도', '으로도', '이라', '라',
    '것', '수', '등', '및', '또', '그', '더', '이후', '앞서', '관련', '대해', '위해', '따라',
    '통해', '대한', '위한', '같은', '지난', '현재', '오늘', '내일', '어제', '해당', '기자',
])

// 이슈 제목에서 제거할 후속/결과형 키워드 — 이것만 남으면 원인 검색에 적합하지 않음
const AFTERMATH_KEYWORDS = new Set([
    '사과', '사과문', '활동중단', '활동 중단', '해명', '인정', '부인', '반박',
    '입장', '입장문', '사퇴', '사임', '체포', '구속', '기소', '해고', '퇴출',
    '탈퇴', '은퇴', '복귀', '재개', '재활동', '후속', '추가입장',
])

function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )
}

/**
 * 이슈 제목에서 후속 키워드를 제거해 원인 탐색용 검색어 생성
 * 예: "알디원 김건우 사과 후 활동 중단" → "알디원 김건우 논란"
 */
function buildCauseSearchQuery(issueTitle: string): string {
    const tokens = issueTitle
        .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2 && !STOPWORDS.has(t) && !AFTERMATH_KEYWORDS.has(t))

    const base = tokens.join(' ')
    return base ? `${base} 논란` : `${issueTitle} 논란`
}

/** 이슈 제목으로 최근 네이버 뉴스 제목 조회 (저장 없이 AI 참고용으로만 사용) */
async function fetchRecentNewsTitles(issueTitle: string, issueTitleKeywords: Set<string>): Promise<string[]> {
    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET
    if (!clientId || !clientSecret) return []

    // 원인 탐색에 적합한 검색어로 변환 (후속 키워드 제거 + "논란" 추가)
    const searchQuery = buildCauseSearchQuery(issueTitle)

    try {
        const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(searchQuery)}&display=15&sort=date`
        const res = await fetch(url, {
            headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret,
            },
        })
        if (!res.ok) return []
        const data = await res.json()
        const items: Array<{ title: string }> = data.items ?? []

        return items
            .map(item => item.title.replace(/<[^>]*>/g, '').trim())
            .filter(title => {
                const titleKeywords = extractKeywords(title)
                const overlap = [...titleKeywords].filter(k => issueTitleKeywords.has(k)).length
                return overlap >= 1
            })
            .slice(0, 10)
    } catch {
        return []
    }
}

/**
 * 이슈 타임라인 AI 요약 생성 후 timeline_summaries에 캐시 저장
 * - update-timeline cron: 새 포인트 추가 후 호출
 * - 어드민 백필: 특정 이슈 강제 재생성 시 호출
 */
export async function generateAndCacheSummaries(
    issueId: string,
    issueTitle: string,
    topicDescription?: string | null,
): Promise<void> {
    const { data: points } = await supabaseAdmin
        .from('timeline_points')
        .select('stage, title, occurred_at')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })

    if (!points || points.length === 0) return

    const STAGE_ORDER_MAP: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3 }

    const grouped = new Map<string, Array<{ title: string; occurred_at: string }>>()
    for (const p of points) {
        if (!grouped.has(p.stage)) grouped.set(p.stage, [])
        grouped.get(p.stage)!.push({ title: p.title ?? '', occurred_at: p.occurred_at })
    }

    const stages = [...grouped.keys()].sort(
        (a, b) => (STAGE_ORDER_MAP[a] ?? 9) - (STAGE_ORDER_MAP[b] ?? 9)
    )

    const stagesText = stages.map(stage => {
        const items = grouped.get(stage)!
        const lines = items.map(i => {
            const dt = new Date(i.occurred_at)
            const dateStr = !isNaN(dt.getTime())
                ? `${dt.getMonth() + 1}월 ${dt.getDate()}일`
                : ''
            return dateStr ? `- [${dateStr}] ${i.title}` : `- ${i.title}`
        }).join('\n')
        return `[${stage}]\n${lines}`
    }).join('\n\n')

    const backgroundLine = topicDescription
        ? `\n이슈 배경 (이슈 등록 시 AI가 요약한 내용): "${topicDescription}"\n`
        : ''

    // 최근 관련 뉴스 제목 조회 (AI 참고용, 저장 안 함)
    // 이슈 상태와 무관하게 항상 실행 — 오래된 이슈도 최근 기사로 육하원칙 추론 가능
    const issueTitleKeywords = extractKeywords(issueTitle)
    const recentTitles = await fetchRecentNewsTitles(issueTitle, issueTitleKeywords)
    const recentNewsLine = recentTitles.length > 0
        ? `\n## 최근 관련 뉴스 제목 (발단 원인 추론용)\n아래 뉴스는 저장되지 않으며, 타임라인 기사와 함께 논란의 실제 원인을 파악하는 데 활용하세요:\n${recentTitles.map(t => `- ${t}`).join('\n')}\n`
        : ''

    // 커뮤니티 게시글 제목 조회 — 더쿠·네이트판은 뉴스보다 구체적인 사건 내용을 담고 있음
    const { data: communityPosts } = await supabaseAdmin
        .from('community_data')
        .select('title, source_site')
        .eq('issue_id', issueId)
        .order('written_at', { ascending: true })
        .limit(15)
    const communityLine = communityPosts && communityPosts.length > 0
        ? `\n## 커뮤니티 게시글 제목 (발단 원인 추론 참고용)\n더쿠·네이트판 등 커뮤니티 반응입니다. 미확인 정보가 포함될 수 있으므로 사실로 단정하지 말고 맥락 파악에만 활용하세요:\n${communityPosts.map(p => `- [${p.source_site}] ${p.title}`).join('\n')}\n`
        : ''

    const prompt = `이슈: "${issueTitle}"
${backgroundLine}${recentNewsLine}${communityLine}
## 타임라인 기사
각 단계는 [발단], [전개], [파생], [진정]으로 구분되어 있습니다.

${stagesText}

## 단계별 요약 원칙
- 각 단계는 해당 단계의 뉴스만 사용해서 요약하세요
- 중복된 내용의 뉴스는 하나만 선택하세요
- bullets 개수는 해당 단계의 뉴스 개수를 초과하지 마세요
- 타임라인 기사, 이슈 배경, 최근 관련 뉴스에 있는 내용만 사용하세요

## [발단] 작성 특별 지침
발단 기사·최근 뉴스·커뮤니티 게시글을 **함께** 참고해 논란의 실제 원인을 추론하세요.
- 사과문·해명·활동 중단 같은 결과/후속 내용은 발단 bullets에서 제외하세요
- 누가, 어디서(플랫폼/장소), 어떤 발언이나 행동이 문제가 됐는지 구체적으로 서술하세요
- 커뮤니티 게시글은 미확인 정보일 수 있으므로 사실로 단정하지 말고 "~했다는 의혹이 제기됐다", "~한 것으로 알려졌다" 같이 헤징 표현을 사용하세요
- WHERE(플랫폼/장소)·WHO(대상)는 확인된 경우 구체적으로, 발언·행동의 정확한 내용은 헤징하세요
- 좋은 예: "유튜브 라이브 방송 중 스태프를 향한 부적절한 발언을 했다는 의혹이 제기됐다"
- 나쁜 예: "논란에 대해 공개 사과했다" / "논란이 시작됐다" (너무 모호) / "욕설을 했다" (단정)
- 두 소스 모두에서 원인을 확인할 수 없으면 확인된 사실만 작성하세요

## 출력 형식
1. 각 단계를 "발단/전개/파생/진정" 중 하나로 분류
2. 핵심 사건들을 bullet points로 (1~5개, 해당 단계 뉴스 개수 이하)
3. 각 bullet은 한 문장으로 간결하게
4. stageTitle에는 단계명 없이 내용만 작성 (예: "녹대 탈출" O, "[발단] 녹대 탈출" X)
5. 각 bullet의 date는 해당 뉴스의 [날짜]를 그대로 사용 (날짜 정보가 없으면 빈 문자열 "")

JSON 응답:
{
  "summaries": [
    {"stage":"발단","stageTitle":"제목","bullets":[{"date":"4월 25일","text":"사건1"},{"date":"4월 26일","text":"사건2"}]},
    {"stage":"전개","stageTitle":"제목","bullets":[{"date":"4월 26일","text":"후속1"},{"date":"4월 27일","text":"후속2"}]}
  ]
}`

    try {
        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 2000 },
        )

        const parsed = parseJsonObject<{
            summaries: Array<{ stage: string; stageTitle: string; bullets: Array<{ date: string; text: string } | string> }>
        }>(content)
        if (!parsed) return

        const rows = stages.map(stage => {
            const items = grouped.get(stage)!
            const dates = items.map(i => i.occurred_at).sort()
            const ai = parsed.summaries?.find((p: { stage: string }) => p.stage === stage)

            // string | {date, text} 양쪽 모두 처리 (backward compat + 새 형식)
            type BulletItem = { date: string; text: string }
            const rawBullets: Array<string | BulletItem> = ai?.bullets ?? []

            let bullets: BulletItem[] = rawBullets
                .map((b): BulletItem | null => {
                    if (typeof b === 'string') {
                        const text = b.trim()
                        return text ? { date: '', text } : null
                    }
                    if (b && typeof b === 'object' && typeof b.text === 'string' && b.text.trim()) {
                        return { date: (b.date ?? '').trim(), text: b.text.trim() }
                    }
                    return null
                })
                .filter((b): b is BulletItem => b !== null)

            if (bullets.length > items.length) {
                console.warn(`  ⚠️ [요약 품질 경고] ${issueTitle} - ${stage}: bullets(${bullets.length}개)가 뉴스(${items.length}개)보다 많음`)
            }

            const uniqueBullets: BulletItem[] = []
            for (const bullet of bullets) {
                const normalized = bullet.text.toLowerCase().trim()
                const isDuplicate = uniqueBullets.some(existing => {
                    const existingNormalized = existing.text.toLowerCase().trim()
                    if (normalized === existingNormalized) return true
                    const shorter = normalized.length < existingNormalized.length ? normalized : existingNormalized
                    const longer = normalized.length >= existingNormalized.length ? normalized : existingNormalized
                    return longer.includes(shorter) && shorter.length / longer.length > 0.9
                })
                if (!isDuplicate) uniqueBullets.push(bullet)
            }

            if (uniqueBullets.length < bullets.length) {
                console.log(`  ✓ [중복 제거] ${issueTitle} - ${stage}: ${bullets.length}개 → ${uniqueBullets.length}개`)
            }

            return {
                issue_id: issueId,
                stage,
                stage_title: ai?.stageTitle ?? stage,
                bullets: uniqueBullets,
                summary: uniqueBullets.map(b => b.text).join(' '),
                date_start: dates[0],
                date_end: dates[dates.length - 1],
                generated_at: new Date().toISOString(),
            }
        })

        const { error: summaryError } = await supabaseAdmin
            .from('timeline_summaries')
            .upsert(rows, { onConflict: 'issue_id,stage' })

        if (summaryError) {
            console.warn(`  ⚠️ [요약 캐시 저장 실패] ${issueTitle}: ${summaryError.message}`)
        } else {
            console.log(`  ✓ [요약 캐시 저장] ${issueTitle}: ${rows.length}개 단계`)
        }
    } catch (err) {
        console.warn(`  ⚠️ [요약 생성 실패] ${issueTitle}:`, err)
    }
}
