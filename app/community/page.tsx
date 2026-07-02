/**
 * app/community/page.tsx
 *
 * [커뮤니티 페이지]
 *
 * 서버 컴포넌트로 metadata export 후 클라이언트 컴포넌트(CommunityClient)에
 * 렌더링을 위임합니다.
 */

import type { Metadata } from 'next'
import CommunityClient from '@/components/community/CommunityClient'

export const metadata: Metadata = {
    title: '커뮤니티',
    description: '왜난리 커뮤니티에서 이슈별 토론 주제에 참여하세요. 진행 중인 토론과 마감된 토론을 한눈에 확인하고 의견을 나눠보세요.',
    keywords: ['커뮤니티', '토론', '논쟁', '의견', '왜난리 커뮤니티', '이슈 토론'],
    alternates: {
        canonical: '/community',
    },
    openGraph: {
        title: '커뮤니티 | 왜난리',
        description: '왜난리 커뮤니티에서 이슈별 토론 주제에 참여하세요. 진행 중인 토론과 마감된 토론을 한눈에 확인하고 의견을 나눠보세요.',
    },
}

export default function CommunityPage() {
    return <CommunityClient />
}
