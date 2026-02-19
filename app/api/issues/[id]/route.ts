import { NextResponse } from 'next/server'

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    // TODO: Supabase에서 이슈 상세 조회

    return NextResponse.json({
        id,
        title: '',
        description: '',
        status: '',
        category: '',
        heat_index: 0,
        created_at: '',
    })
}
