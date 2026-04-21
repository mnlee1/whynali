/**
 * scripts/regenerate-timeline-for-issues.ts
 *
 * 특정 이슈들의 타임라인 요약을 재생성하는 스크립트
 */

const ISSUE_IDS = [
    '721be643-0d50-4da8-bae1-434384f7679a', // 트럼프, 이란과 호르무즈 통행료 공동징수 구상
    '9e662c32-6886-46fd-8af8-0a6fefc95f47', // 대전 오월드 탈출 늑대 30시간 수색
    '787e37ad-7bca-4add-ae7a-eb99b242dcf2', // 미·이란 협상
    '04279130-016b-4a1a-8066-39d56e1a570e', // 호르무즈 해협 통행료
    'f769cc9a-0331-4e79-b8d5-cc449e516377', // '계엄령 놀이' 양양군 공무원 징역 1년8개월
    'ff78456a-4bef-4b46-b2d3-ab51e00c9120', // 전한길 명예훼손 혐의
    '5c4eba2f-edcc-4e73-b4f1-b88ad1ddcd4f', // 삼성전자 노조 총파업 위협
    'd45c51b3-4b9d-404b-9737-1faeee850a44', // 세월호 참사 12주기 추모
    '46a1662b-cefe-4601-b57b-eb7a3e0cf974', // 장원영 BTS 고양 콘서트 직관
]

async function regenerateTimelines() {
    console.log(`\n[타임라인 재생성 시작] ${ISSUE_IDS.length}개 이슈`)
    console.log('='.repeat(60))

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < ISSUE_IDS.length; i++) {
        const issueId = ISSUE_IDS[i]
        console.log(`\n[${i + 1}/${ISSUE_IDS.length}] Processing: ${issueId}`)

        try {
            const response = await fetch(`http://localhost:3000/api/admin/migrations/regenerate-single-timeline?issueId=${issueId}`, {
                method: 'POST',
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = await response.json()
            console.log(`  ✓ 성공: ${data.title}`)
            console.log(`     - 단계: ${data.stages}개`)
            successCount++
        } catch (error) {
            console.error(`  ✗ 실패: ${error}`)
            failCount++
        }

        // Rate limit 방지를 위한 대기 (800ms)
        if (i < ISSUE_IDS.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800))
        }
    }

    console.log('\n' + '='.repeat(60))
    console.log(`[완료] 성공: ${successCount}개, 실패: ${failCount}개`)
}

regenerateTimelines().catch(console.error)
