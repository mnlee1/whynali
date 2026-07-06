/**
 * POST /api/admin/card-news/preview
 *
 * Body: { issueId: string, mode: 'surging' | 'timeline' | 'qa' | 'debate' }
 * Returns: { htmlSlides: string[], slides: SlideContent[] }
 *
 * iframe 렌더링용 HTML 슬라이드 배열과 구조화된 slides(텍스트 수정용 원본 데이터) 반환.
 * Playwright 없이 Next.js 서버리스 환경에서 동작.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { generateSlidesForIssue, getLogoBase64, slidesToHtmlArray } from '@/lib/card-news/core'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: { issueId?: string; mode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { issueId, mode } = body
  if (!issueId || !mode) {
    return NextResponse.json({ error: 'issueId와 mode가 필요합니다.' }, { status: 400 })
  }

  const validModes = ['surging', 'timeline', 'qa', 'debate']
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: `mode는 ${validModes.join(', ')} 중 하나여야 합니다.` }, { status: 400 })
  }

  try {
    const logoBase64 = getLogoBase64()
    const slides = await generateSlidesForIssue(
      issueId,
      mode as 'surging' | 'timeline' | 'qa' | 'debate',
      logoBase64
    )
    const htmlSlides = slidesToHtmlArray(slides)
    return NextResponse.json({ htmlSlides, slides })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('[card-news/preview] 오류:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
