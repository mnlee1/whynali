/**
 * app/api/admin/issues/[id]/approve/route.ts
 *
 * [관리자 - 이슈 승인 API]
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'
import { fetchUnsplashImages } from '@/lib/unsplash'
import { generateDiscussionTopics } from '@/lib/ai/discussion-generator'
import { generateVoteOptions } from '@/lib/ai/vote-generator'

const CATEGORY_PATH_MAP: Record<string, string> = {
    '사회': '/society',
    '기술': '/tech',
    '연예': '/entertain',
    '스포츠': '/sports',
    '정치': '/politics',
    '경제': '/economy',
    '세계': '/world',
}

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        const { id } = await params

        const { data, error } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: '승인',
                approval_type: 'manual',
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('id, title, category, status, heat_index, thumbnail_urls')
            .single()

        if (error) throw error

        // Unsplash 이미지 검색 (이미지가 없을 때만)
        // 트랙 A에서 이미 이미지가 생성되었으면 건너뜀
        const hasThumbnails = data.thumbnail_urls && Array.isArray(data.thumbnail_urls) && data.thumbnail_urls.length > 0
        
        if (!hasThumbnails) {
            const thumbnailUrls = await fetchUnsplashImages(data.title, data.category)
            if (thumbnailUrls.length > 0) {
                await supabaseAdmin.from('issues').update({ 
                    thumbnail_urls: thumbnailUrls,
                    primary_thumbnail_index: 0,
                }).eq('id', id)
            }
        }

        await writeAdminLog('이슈 상태 변경: 대기 > 승인', 'issue', id, auth.adminEmail, `"${data.title}"`)

        const categoryPath = CATEGORY_PATH_MAP[data.category]
        if (categoryPath) revalidatePath(categoryPath)
        revalidatePath('/')

        // 승인 후 투표·토론 주제 자동 생성 (백그라운드)
        after(async () => {
            try {
                const metadata = {
                    id: data.id,
                    title: data.title,
                    category: data.category ?? '사회',
                    status: data.status ?? '점화',
                    heat_index: data.heat_index ?? undefined,
                }

                const [topics, votes] = await Promise.all([
                    generateDiscussionTopics(metadata, 3).catch(() => []),
                    generateVoteOptions(metadata, 1).catch(() => []),
                ])

                if (topics.length > 0) {
                    await supabaseAdmin.from('discussion_topics').insert(
                        topics.map(t => ({
                            issue_id: data.id,
                            body: t.content,
                            is_ai_generated: true,
                            approval_status: '대기',
                        }))
                    )
                }

                if (votes.length > 0) {
                    const vote = votes[0]
                    const { data: newVote } = await supabaseAdmin
                        .from('votes')
                        .insert({
                            issue_id: data.id,
                            title: vote.title,
                            phase: '대기',
                            approval_status: '대기',
                            is_ai_generated: true,
                            issue_status_snapshot: data.status ?? null,
                        })
                        .select('id')
                        .single()

                    if (newVote) {
                        await supabaseAdmin.from('vote_choices').insert(
                            vote.choices.map(label => ({
                                vote_id: newVote.id,
                                label,
                            }))
                        )
                    }
                }

                console.log(`[approve] 투표·토론 자동 생성 완료 — 토론 ${topics.length}건, 투표 ${votes.length}건 (이슈: "${data.title}")`)
            } catch (e) {
                console.error('[approve] 투표·토론 자동 생성 실패:', e)
            }
        })

        return NextResponse.json({ data })
    } catch (error) {
        console.error('이슈 승인 에러:', error)
        return NextResponse.json(
            { error: 'APPROVE_ERROR', message: '이슈 승인 실패' },
            { status: 500 }
        )
    }
}

