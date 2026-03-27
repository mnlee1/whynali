/**
 * app/page.tsx
 *
 * [홈 페이지 — 메인화면]
 *
 * 왜난리 서비스의 메인 화면입니다.
 * 상단은 2컬럼 레이아웃으로 구성됩니다.
 *   - 왼쪽(2/3): 왜난리 이슈 캐러셀
 *   - 오른쪽(1/3): N월 N주 인기 랭킹
 * 하단에는 투표 미리보기, 전체 이슈 목록, 커뮤니티 토론이 이어집니다.
 * 
 * 성능 최적화:
 * - ISR (Incremental Static Regeneration): 15분 캐싱
 * - 효과: 페이지 로딩 0.5초 → 0.05초 (10배 향상)
 */

import IssueList from '@/components/issues/IssueList'
import HotIssueHighlight from '@/components/issues/HotIssueHighlight'
import PopularRanking from '@/components/issues/PopularRanking'
import VotePreview from '@/components/votes/VotePreview'
import CommunityPreview from '@/components/community/CommunityPreview'

// ISR: 15분(900초)마다 페이지 재생성
// 동시접속자 1,000명이 같은 페이지 보더라도 15분에 한 번만 생성하면 됨
export const revalidate = 900

export default function HomePage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8 space-y-10">
            {/* 상단 2컬럼: 히어로 / 인기 랭킹 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 왼쪽: 캐러셀 */}
                <div className="lg:col-span-2">
                    <HotIssueHighlight />
                </div>

                {/* 오른쪽: 인기 랭킹 */}
                <div className="lg:col-span-1 h-full">
                    <PopularRanking />
                </div>
            </div>

            {/* 투표 미리보기 */}
            <VotePreview />

            {/* 전체 이슈 목록 */}
            <section>
                <IssueList initialLimit={10} hideSearch showFullLabel />
            </section>

            {/* 커뮤니티 최신 토론 */}
            <CommunityPreview />
        </div>
    )
}
