/**
 * lib/api-errors.ts
 *
 * API 응답용 에러 메시지 한글화.
 * DB/Supabase 영문 에러를 사용자에게 보여줄 한글 문구로 변환한다.
 */

export function toUserMessage(msg: string, context?: 'comment'): string {
    if (!msg || typeof msg !== 'string') return '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
    if (msg.includes('unique') && msg.includes('ON CONFLICT')) return '감정 표현 처리 중 제약 조건 오류가 났습니다. 잠시 후 다시 시도해 주세요.'
    if (msg.includes('row-level security')) return context === 'comment' ? '권한이 없어 댓글을 등록할 수 없습니다.' : '권한이 없어 요청을 처리할 수 없습니다.'
    if (msg.includes('violates foreign key')) return context === 'comment' ? '존재하지 않는 항목에 댓글을 달 수 없습니다.' : '존재하지 않는 항목에 대한 요청입니다.'
    if (msg.includes('duplicate key')) return context === 'comment' ? '이미 등록된 댓글입니다.' : '이미 등록된 내용입니다.'
    return msg
}
