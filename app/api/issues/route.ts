import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    // TODO: Supabase에서 이슈 목록 조회
    // Query params: category, status, q, sort, limit, offset
    
    return NextResponse.json({
        data: [],
        total: 0,
    })
}
