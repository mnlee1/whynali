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

    const { data: userData, error: userDataError } = await admin
        .from('users')
        .select('display_name, provider, created_at, marketing_agreed, contact_email')
        .eq('id', user.id)
        .single()

    const isAdmin = user.app_metadata?.is_admin === true

    if (!userData?.display_name && !isAdmin) redirect('/onboarding')

    const [commentsRes, discussionsRes, votesRes] = await Promise.all([
        // 이슈 댓글
        admin
            .from('comments')
            .select('id, body, created_at, like_count, dislike_count, issues(id, title)')
            .eq('user_id', user.id)
            .eq('visibility', 'public')
            .not('issue_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(30),
        // 토론 댓글
        admin
            .from('comments')
            .select('id, body, created_at, like_count, dislike_count, discussion_topics(id, body, issues(id, title))')
            .eq('user_id', user.id)
            .eq('visibility', 'public')
            .not('discussion_topic_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(30),
        // 투표 참여
        admin
            .from('user_votes')
            .select('id, created_at, vote_choices(label, count), votes(id, title, phase, issues(id, title), vote_choices(count))')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(30),
    ])

    // admin 직접 로그인: user.email = mnlee@nhnad.com 그대로 표시
    // 일반 사용자 또는 카카오/구글로 로그인한 운영자: user_metadata의 실제 이메일 표시
    const providerAccount = isAdmin
        ? (user.email ?? null)
        : ((user.user_metadata?.real_email as string | null) ?? null)

    // 운영자 contact_email이 DB에 없으면 가입 이메일로 자동 저장
    const adminEmail = user.email ?? null
    if (isAdmin && !userData?.contact_email && adminEmail) {
        await admin
            .from('users')
            .update({ contact_email: adminEmail, marketing_agreed: true })
            .eq('id', user.id)
    }

    const contactEmail = isAdmin
        ? (userData?.contact_email ?? adminEmail)
        : (userData?.contact_email ?? null)

    return (
        <MypageClient
            userId={user.id}
            provider={userData?.provider ?? ''}
            displayName={userData?.display_name ?? '관리자'}
            joinedAt={userData?.created_at ?? user.created_at ?? new Date().toISOString()}
            marketingAgreed={userData?.marketing_agreed ?? true}
            contactEmail={contactEmail}
            providerAccount={providerAccount}
            isAdmin={isAdmin}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            comments={(commentsRes.data ?? []) as any[]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            discussions={(discussionsRes.data ?? []) as any[]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            votes={(votesRes.data ?? []) as any[]}
        />
    )
}
