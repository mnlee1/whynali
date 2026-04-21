/**
 * 개선된 브라우저 콘솔 스크립트
 * 에러 핸들링 강화 + 긴 대기시간 + 재시도 로직
 */

const ISSUE_IDS = [
    '721be643-0d50-4da8-bae1-434384f7679a', // 성공함
    '9e662c32-6886-46fd-8af8-0a6fefc95f47',
    '787e37ad-7bca-4add-ae7a-eb99b242dcf2',
    '04279130-016b-4a1a-8066-39d56e1a570e',
    'f769cc9a-0331-4e79-b8d5-cc449e516377',
    'ff78456a-4bef-4b46-b2d3-ab51e00c9120',
    '5c4eba2f-edcc-4e73-b4f1-b88ad1ddcd4f',
    'd45c51b3-4b9d-404b-9737-1faeee850a44',
    '46a1662b-cefe-4601-b57b-eb7a3e0cf974',
]

async function regenerateWithRetry() {
    console.log(`재생성 시작: ${ISSUE_IDS.length}개 이슈 (첫 번째는 이미 성공)`)
    let success = 1, fail = 0 // 첫 번째는 이미 성공
    
    // 첫 번째 이슈는 건너뛰기 (이미 성공)
    for (let i = 1; i < ISSUE_IDS.length; i++) {
        const issueId = ISSUE_IDS[i]
        let retries = 0
        const maxRetries = 2
        
        while (retries <= maxRetries) {
            try {
                console.log(`\n[${i+1}/${ISSUE_IDS.length}] 처리중... ${retries > 0 ? `(재시도 ${retries})` : ''}`)
                
                const res = await fetch(`/api/admin/migrations/regenerate-single-timeline?issueId=${issueId}`, { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
                
                if (!res.ok) {
                    const errorText = await res.text()
                    throw new Error(`HTTP ${res.status}: ${errorText}`)
                }
                
                const data = await res.json()
                
                if (data.success) {
                    console.log(`✓ ${data.title}`)
                    console.log(`  단계: ${data.stages}개, bullets: ${data.bullets}개`)
                    success++
                    break // 성공하면 재시도 루프 탈출
                } else {
                    throw new Error(data.error || 'Unknown error')
                }
            } catch (err) {
                console.error(`✗ 에러:`, err.message)
                retries++
                
                if (retries > maxRetries) {
                    console.error(`  → 최대 재시도 초과, 다음 이슈로 진행`)
                    fail++
                    break
                } else {
                    console.log(`  → ${3}초 후 재시도...`)
                    await new Promise(r => setTimeout(r, 3000))
                }
            }
        }
        
        // 다음 이슈 처리 전 대기 (Rate limit 방지)
        if (i < ISSUE_IDS.length - 1) {
            console.log(`  다음 이슈까지 2초 대기...`)
            await new Promise(r => setTimeout(r, 2000))
        }
    }
    
    console.log(`\n${'='.repeat(60)}`)
    console.log(`완료 - 성공: ${success}/${ISSUE_IDS.length}, 실패: ${fail}/${ISSUE_IDS.length}`)
}

regenerateWithRetry()
