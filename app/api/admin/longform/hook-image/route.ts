/**
 * app/api/admin/longform/hook-image/route.ts
 *
 * [관리자 - 롱폼 오프닝 훅 배경 이미지 미리보기 API]
 *
 * 관리자가 입력한 검색어/카테고리로 실제 생성 때와 동일한 로직(createHookBackground)을 태워
 * 밝기/마스크 처리까지 끝난 최종 이미지를 미리 보여준다.
 * 이때 사용된 seed와 AI가 뽑은 keywords를 함께 반환하며, 실제 롱폼 생성 요청에 이 둘을 그대로
 * 넘기면 동일한 이미지가 선택된다 — keywords 없이 seed만 넘기면 AI 키워드 추출을 다시 타서
 * 매번 다른 키워드가 나올 수 있어 seed가 무의미해지므로 반드시 함께 넘겨야 한다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { requireAdmin } from '@/lib/admin'
import { createHookBackground } from '@/lib/longform/generate-hook'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface PreviewBody {
    query?: string
    category?: string
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    let body: PreviewBody
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
    }

    const query = body.query?.trim() || undefined
    const category = body.category?.trim() || undefined
    const seed = Math.floor(Math.random() * 100000)

    const tmpDir = join(tmpdir(), `hook-image-preview-${Date.now()}`)
    try {
        await mkdir(tmpDir, { recursive: true })
        const { buffer, keywords } = await createHookBackground(tmpDir, query, category, seed)
        return NextResponse.json({
            imageDataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
            seed,
            keywords,
        })
    } catch (error) {
        console.error('훅 이미지 미리보기 에러:', error)
        return NextResponse.json(
            { error: 'PREVIEW_ERROR', message: '이미지 미리보기 생성 실패' },
            { status: 500 }
        )
    } finally {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
}
