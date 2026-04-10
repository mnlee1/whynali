/**
 * app/api/debug/env/route.ts
 * 
 * 환경변수 디버그 엔드포인트 (프로덕션에서만 사용, 곧 삭제 예정)
 */

import { NextResponse } from 'next/server'

export async function GET() {
    // 보안을 위해 일부만 노출
    return NextResponse.json({
        env: process.env.NODE_ENV,
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseUrlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30),
        hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        minHeat: process.env.CANDIDATE_MIN_HEAT_TO_REGISTER || 'NOT_SET (기본값 8 사용)',
        timestamp: new Date().toISOString(),
    })
}
