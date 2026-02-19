import { NextResponse } from 'next/server'

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    // TODO: Supabase에서 이슈 상세 조회
    
    return NextResponse.json({
        id: params.id,
        title: '',
        description: '',
        status: '',
        category: '',
        heat_index: 0,
        created_at: '',
    })
}
