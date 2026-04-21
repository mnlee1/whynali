/**
 * scripts/update-production-timeline-summaries.ts
 * 
 * 실서버 기존 타임라인 포인트에 AI 요약 생성
 * 
 * 실행 방법:
 * SUPABASE_URL=<실서버URL> SUPABASE_SERVICE_ROLE_KEY=<실서버키> npx tsx scripts/update-production-timeline-summaries.ts
 */

// 1. 먼저 실서버 환경변수 저장
const PROD_SUPABASE_URL = process.env.SUPABASE_URL
const PROD_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// 2. .env.local에서 GROQ_API_KEY만 수동으로 읽기
import { readFileSync } from 'fs'
import { resolve } from 'path'

try {
    const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    const groqKeys = envContent
        .split('\n')
        .filter(line => line.startsWith('GROQ_API_KEY'))
        .map(line => {
            const [key, value] = line.split('=')
            return { key: key.trim(), value: value.trim().replace(/['"]/g, '') }
        })
    
    groqKeys.forEach(({ key, value }) => {
        if (!process.env[key]) {
            process.env[key] = value
        }
    })
    
    console.log(`✓ ${groqKeys.length}개 GROQ_API_KEY 로드 완료`)
} catch (e) {
    console.error('⚠️  .env.local 읽기 실패, GROQ_API_KEY가 설정되지 않을 수 있습니다')
}

// 3. 실서버 환경변수 복원 (덮어쓰지 않도록)
if (PROD_SUPABASE_URL) {
    process.env.SUPABASE_URL = PROD_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_SUPABASE_URL  // 추가!
}
if (PROD_SUPABASE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = PROD_SUPABASE_KEY
}

import { createClient } from '@supabase/supabase-js'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonArray } from '@/lib/ai/parse-json-response'

const BATCH_SIZE = 10 // 한 번에 처리할 이슈 개수
const DELAY_MS = 2000 // 각 AI 호출 간 대기 시간 (Rate Limit 방지)

async function updateProductionTimelines() {
    // 4. 저장해둔 실서버 환경변수 사용
    const supabaseUrl = PROD_SUPABASE_URL
    const supabaseKey = PROD_SUPABASE_KEY

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ 환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
        process.exit(1)
    }

    console.log(`✓ 실서버 URL: ${supabaseUrl}`)
    console.log(`✓ 실서버 키: ${supabaseKey.substring(0, 20)}...`)

    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('[실서버 타임라인 AI 요약 생성] 시작...\n')

    // 1. ai_summary가 null인 타임라인 포인트가 있는 이슈 조회 (모든 이슈)
    const { data: issues, error: issuesError } = await supabase
        .from('issues')
        .select('id, title, approval_status, status')
        .order('created_at', { ascending: false })
        .limit(200) // 최근 200개 이슈

    if (issuesError || !issues || issues.length === 0) {
        console.error('❌ 이슈 조회 실패:', issuesError)
        return
    }

    console.log(`✓ 처리 대상 이슈: ${issues.length}개 (모든 상태 포함)\n`)

    let totalUpdated = 0
    let totalSkipped = 0
    let totalFailed = 0

    // 배치 처리
    for (let i = 0; i < issues.length; i += BATCH_SIZE) {
        const batch = issues.slice(i, i + BATCH_SIZE)
        
        console.log(`\n[배치 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(issues.length / BATCH_SIZE)}] 처리 중...\n`)

        for (const issue of batch) {
            try {
                // 해당 이슈의 타임라인 포인트 조회
                const { data: points, error: pointsError } = await supabase
                    .from('timeline_points')
                    .select('id, title, stage')
                    .eq('issue_id', issue.id)
                    .is('ai_summary', null)
                    .order('occurred_at', { ascending: true })

                if (pointsError || !points || points.length === 0) {
                    console.log(`  ⊘ "${issue.title}" [${issue.approval_status}/${issue.status}]: 업데이트 필요 없음`)
                    totalSkipped++
                    continue
                }

                console.log(`  📝 "${issue.title}" [${issue.approval_status}/${issue.status}]: ${points.length}개 포인트 처리 중...`)

                // AI로 요약 생성
                const newsListText = points.map((p, i) => `${i + 1}. ${p.title}`).join('\n')

                const prompt = `다음은 한국 이슈 "${issue.title}"와 관련된 뉴스 제목 목록입니다.

## 뉴스 제목 목록:
${newsListText}

## 작업: 각 뉴스를 간결한 문장으로 요약
- 첫 부분은 핵심 키워드 (3~5단어)
- 그 다음 콜론(:)과 함께 2~3문장으로 설명
- 제목에서 확인할 수 있는 사실만 작성
- 과도한 추측 금지

예시:
{"index":1,"pointSummary":"경찰 수사 착수: 드라마 촬영장에서 스태프 사망 사고가 발생했다. 경찰이 사건 경위를 조사하고 있으며, 촬영장 안전 관리 소홀 여부에 대한 수사를 시작했다."}

중요: pointSummary는 반드시 "키워드: 설명" 형식의 일반 텍스트여야 합니다. JSON 객체가 아닙니다!

반드시 아래 JSON 배열 형식으로만 답하세요:
[{"index":1,"pointSummary":"키워드: 설명"},{"index":2,"pointSummary":"키워드: 설명"}]`

                const content = await callGroq(
                    [{ role: 'user', content: prompt }],
                    { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 2000 },
                )

                const parsed = parseJsonArray<{ index: number; pointSummary: string }>(content)

                if (!parsed || parsed.length === 0) {
                    console.error(`  ❌ AI 응답 파싱 실패: "${issue.title}"`)
                    totalFailed++
                    continue
                }

                // DB 업데이트
                let updated = 0
                for (const item of parsed) {
                    const point = points[item.index - 1]
                    if (!point) continue

                    const { error: updateError } = await supabase
                        .from('timeline_points')
                        .update({ ai_summary: item.pointSummary })
                        .eq('id', point.id)

                    if (!updateError) {
                        updated++
                    }
                }

                console.log(`  ✓ "${issue.title}": ${updated}/${points.length}개 업데이트 완료`)
                totalUpdated += updated

                // Rate Limit 방지
                await new Promise(resolve => setTimeout(resolve, DELAY_MS))

            } catch (error) {
                console.error(`  ❌ "${issue.title}" 처리 실패:`, error)
                totalFailed++
            }
        }
    }

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ 모든 배치 처리 완료!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`총 ${totalUpdated}개 포인트 업데이트`)
    console.log(`${totalSkipped}개 이슈 건너뜀`)
    console.log(`${totalFailed}개 실패`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

updateProductionTimelines()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('치명적 에러:', error)
        process.exit(1)
    })
