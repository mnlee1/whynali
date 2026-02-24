/**
 * app/page.tsx
 *
 * [홈 페이지 — 메인화면]
 *
 * 왜난리 서비스의 메인 화면입니다.
 * 지금 가장 뜨거운 이슈를 상단에 강조하고, 카테고리 탐색 / 투표 참여 / 커뮤니티 진입까지
 * 하나의 화면에서 흐름이 이어지도록 구성됩니다.
 *
 * 레이아웃 순서:
 *   1. 화력 TOP 이슈 하이라이트 (HotIssueHighlight)
 *   2. 진행 중 이슈 가로 스트립 (ActiveIssueStrip)
 *   3. 투표 미리보기 (VotePreview)
 *   4. 전체 이슈 목록 (IssueList)
 *   5. 커뮤니티 토론 미리보기 (CommunityPreview)
 */

import IssueList from '@/components/issues/IssueList'
import HotIssueHighlight from '@/components/issues/HotIssueHighlight'
import ActiveIssueStrip from '@/components/issues/ActiveIssueStrip'
import VotePreview from '@/components/votes/VotePreview'
import CommunityPreview from '@/components/community/CommunityPreview'

export default function HomePage() {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8 space-y-8">
            {/* 화력 TOP 이슈 강조 */}
            <HotIssueHighlight />

            {/* 진행 중 이슈 가로 스트립 */}
            <ActiveIssueStrip />

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
