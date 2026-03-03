/**
 * scripts/calculate_heat_examples.ts
 * 
 * 화력 10점 달성 조건 시뮬레이션
 */

// 뉴스 신뢰도 계산
function calculateNewsCredibility(newsCount: number, uniqueSources: number): number {
    const sourceScore = (Math.min(20, uniqueSources) / 20) * 100
    const countScore = Math.min(100, newsCount * 2)
    return Math.round(sourceScore * 0.6 + countScore * 0.4)
}

// 커뮤니티 반응 계산
function calculateCommunityHeat(viewCount: number, commentCount: number): number {
    const viewScore = Math.min(100, (viewCount / 5000) * 100)
    const commentScore = Math.min(100, (commentCount / 500) * 100)
    return Math.round(viewScore * 0.35 + commentScore * 0.45)
}

// 커뮤니티 증폭 계수
function calculateCommunityAmp(communityHeat: number): number {
    if (communityHeat <= 3) return 0
    return Math.min(1, Math.sqrt(Math.max(0, communityHeat - 3) / 70))
}

// 최종 화력
function calculateHeat(newsCredibility: number, communityAmp: number): number {
    return Math.round(newsCredibility * (0.3 + 0.7 * communityAmp))
}

console.log('=== 화력 10점 달성 조건 시뮬레이션 ===\n')

console.log('[ 케이스 1: 뉴스 5건, 출처 5곳, 커뮤니티 없음 ]')
const news1 = calculateNewsCredibility(5, 5)
const heat1 = calculateHeat(news1, 0)
console.log(`뉴스 신뢰도: ${news1}점`)
console.log(`화력: ${heat1}점 ❌ (10점 미달)\n`)

console.log('[ 케이스 2: 뉴스 10건, 출처 10곳, 커뮤니티 없음 ]')
const news2 = calculateNewsCredibility(10, 10)
const heat2 = calculateHeat(news2, 0)
console.log(`뉴스 신뢰도: ${news2}점`)
console.log(`화력: ${heat2}점 ${heat2 >= 10 ? '✅' : '❌'}\n`)

console.log('[ 케이스 3: 뉴스 5건, 출처 5곳, 조회 500 + 댓글 50 ]')
const news3 = calculateNewsCredibility(5, 5)
const comm3 = calculateCommunityHeat(500, 50)
const amp3 = calculateCommunityAmp(comm3)
const heat3 = calculateHeat(news3, amp3)
console.log(`뉴스 신뢰도: ${news3}점`)
console.log(`커뮤니티 반응: ${comm3}점 (증폭 ${amp3.toFixed(2)})`)
console.log(`화력: ${heat3}점 ${heat3 >= 10 ? '✅' : '❌'}\n`)

console.log('[ 케이스 4: 뉴스 5건, 출처 5곳, 조회 1000 + 댓글 100 ]')
const news4 = calculateNewsCredibility(5, 5)
const comm4 = calculateCommunityHeat(1000, 100)
const amp4 = calculateCommunityAmp(comm4)
const heat4 = calculateHeat(news4, amp4)
console.log(`뉴스 신뢰도: ${news4}점`)
console.log(`커뮤니티 반응: ${comm4}점 (증폭 ${amp4.toFixed(2)})`)
console.log(`화력: ${heat4}점 ${heat4 >= 10 ? '✅' : '❌'}\n`)

console.log('[ 결론 ]')
console.log('뉴스 5건만으로는 화력 10점 달성 어려움.')
console.log('뉴스 10건 이상 OR 커뮤니티 반응 필요.')
console.log('커뮤니티 조회 1000 + 댓글 100 정도면 뉴스 5건으로도 10점 가능.')
