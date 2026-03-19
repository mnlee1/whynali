/**
 * app/mypage/page.tsx
 *
 * 마이페이지 — 서버 컴포넌트
 * - 인증 체크 (미로그인 → /login, 온보딩 미완료 → /onboarding)
 * - 유저 프로필 + 활동 데이터(댓글·토론·투표) 조회 후 클라이언트에 전달
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import MypageClient from './MypageClient'

export default async function MypagePage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login?next=/mypage')

    const admin = createSupabaseAdminClient()

    const { data: userData } = await admin
        .from('users')
        .select('display_name, provider, created_at, marketing_agreed')
        .eq('id', user.id)
        .single()

    if (!userData?.display_name) redirect('/onboarding')

    const [commentsRes, discussionsRes, votesRes] = await Promise.all([
        // 이슈 댓글
        admin
            .from('comments')
            .select('id, body, created_at, like_count, issues(id, title)')
            .eq('user_id', user.id)
            .eq('visibility', 'public')
            .not('issue_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(30),
        // 토론 댓글
        admin
            .from('comments')
            .select('id, body, created_at, like_count, discussion_topics(id, body, issues(id, title))')
            .eq('user_id', user.id)
            .eq('visibility', 'public')
            .not('discussion_topic_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(30),
        // 투표 참여
        admin
            .from('user_votes')
            .select('id, created_at, vote_choices(label), votes(id, title, phase, issues(id, title))')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(30),
    ])

    const displayEmail = user.email && !user.email.endsWith('@naver.oauth')
        ? user.email
        : null

    return (
        <MypageClient
            userId={user.id}
            provider={userData.provider ?? ''}
            email={displayEmail}
            displayName={userData.display_name}
            joinedAt={userData.created_at}
            marketingAgreed={userData.marketing_agreed ?? false}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            comments={(commentsRes.data ?? []) as any[]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            discussions={(discussionsRes.data ?? []) as any[]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            votes={(votesRes.data ?? []) as any[]}
        />
    )
}
