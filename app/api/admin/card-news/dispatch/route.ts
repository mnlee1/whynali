/**
 * POST /api/admin/card-news/dispatch
 *
 * Body: { issueId: string, mode: 'surging' | 'timeline' | 'qa' | 'debate', publish?: boolean, slides: SlideContent[] }
 * Returns: { ok: boolean, runUrl?: string }
 *
 * 관리자가 수정한 slides를 card_news_drafts에 저장한 뒤, draft_id와 함께
 * GitHub Actions workflow_dispatch를 트리거하여 실제 카드뉴스 생성 + SNS 업로드를 실행.
 * pipeline.ts는 draft_id로 이 slides를 그대로 가져다 써서 AI 재생성을 스킵한다.
 * 환경변수 GITHUB_DISPATCH_PAT (repo + workflow 권한 Personal Access Token) 필요.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { saveCardNewsDraft, type ContentMode, type SlideContent } from '@/lib/card-news/core'

export const dynamic = 'force-dynamic'

const GITHUB_OWNER = 'mnlee1'
const GITHUB_REPO = 'whynali'
const WORKFLOW_FILE = 'card-news.yml'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const pat = process.env.GITHUB_DISPATCH_PAT
  if (!pat) {
    return NextResponse.json(
      { error: 'GITHUB_DISPATCH_PAT 환경변수가 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  let body: { issueId?: string; mode?: string; publish?: boolean; slides?: SlideContent[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { issueId, mode, publish = true, slides } = body
  if (!issueId || !mode) {
    return NextResponse.json({ error: 'issueId와 mode가 필요합니다.' }, { status: 400 })
  }
  if (!Array.isArray(slides) || slides.length === 0) {
    return NextResponse.json({ error: 'slides가 필요합니다. 먼저 미리보기를 생성하세요.' }, { status: 400 })
  }

  const validModes = ['surging', 'timeline', 'qa', 'debate']
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: `mode는 ${validModes.join(', ')} 중 하나여야 합니다.` }, { status: 400 })
  }

  let draftId: string
  try {
    draftId = await saveCardNewsDraft(issueId, mode as ContentMode, slides, auth.adminEmail)
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('[card-news/dispatch] draft 저장 실패:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        mode,
        issue_id: issueId,
        publish: publish ? 'true' : 'false',
        draft_id: draftId,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[card-news/dispatch] GitHub API 오류:', res.status, text)
    return NextResponse.json(
      { error: `GitHub API 오류 (${res.status}): ${text}` },
      { status: 502 }
    )
  }

  const runUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}`
  return NextResponse.json({ ok: true, runUrl })
}
