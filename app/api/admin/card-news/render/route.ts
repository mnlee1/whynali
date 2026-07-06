/**
 * POST /api/admin/card-news/render
 *
 * Body: { slides: SlideContent[] }
 * Returns: { htmlSlides: string[] }
 *
 * 관리자가 미리보기에서 텍스트를 수정한 뒤 다시 렌더링하기 위한 경량 엔드포인트.
 * AI 호출·Supabase 조회 없이 순수 템플릿 렌더링만 수행.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { slidesToHtmlArray, type SlideContent } from '@/lib/card-news/core'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: { slides?: SlideContent[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { slides } = body
  if (!Array.isArray(slides) || slides.length === 0) {
    return NextResponse.json({ error: 'slides가 필요합니다.' }, { status: 400 })
  }

  try {
    const htmlSlides = slidesToHtmlArray(slides)
    return NextResponse.json({ htmlSlides })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('[card-news/render] 오류:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
