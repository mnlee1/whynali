/**
 * app/page.tsx
 *
 * [홈 페이지 — 메인화면]
 *
 * 왜난리 서비스의 메인 화면입니다.
 * 상단은 2컬럼 레이아웃으로 구성됩니다.
 *   - 왼쪽(2/3): 오늘의 이슈 캐러셀 + 최근 이슈 2열 카드
 *   - 오른쪽(1/3): N월 N주 인기 랭킹
 * 하단에는 투표 미리보기, 전체 이슈 목록, 커뮤니티 토론이 이어집니다.
 */

import IssueList from '@/components/issues/IssueList'
import HotIssueHighlight from '@/components/issues/HotIssueHighlight'
import ActiveIssueStrip from '@/components/issues/ActiveIssueStrip'
import PopularRanking from '@/components/issues/PopularRanking'
import VotePreview from '@/components/votes/VotePreview'
import CommunityPreview from '@/components/community/CommunityPreview'

export default function HomePage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8 space-y-10">
            {/* 상단 2컬럼: 히어로+최근 이슈 / 인기 랭킹 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 왼쪽: 캐러셀 + 최근 이슈 카드 */}
                <div className="lg:col-span-2 space-y-4">
                    <HotIssueHighlight />
                    <ActiveIssueStrip />
                </div>

                {/* 오른쪽: 인기 랭킹 */}
                <div className="lg:col-span-1">
                    <PopularRanking />
                </div>
            </div>

            {/* 투표 미리보기 */}
            <VotePreview />

            {/* 전체 이슈 목록 */}
            <section>
                <h2 className="text-base font-bold text-neutral-900 mb-4">전체 이슈</h2>
                <IssueList />
            </section>

            {/* 커뮤니티 최신 토론 */}
            <CommunityPreview />
        </div>
    )
}
