/**
 * lib/utils/decode-html.ts
 *
 * HTML 엔티티 디코딩 유틸
 *
 * 뉴스 수집 데이터에 포함된 &quot;, &amp; 등의 HTML 엔티티를
 * 실제 문자로 변환합니다. 서버·클라이언트 양쪽에서 사용 가능합니다.
 *
 * 예시:
 *   decodeHtml('&quot;아이브&quot; 컴백') // → '"아이브" 컴백'
 */

const HTML_ENTITIES: Record<string, string> = {
    '&quot;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
}

export function decodeHtml(str: string | null | undefined): string {
    if (!str) return ''
    return str
        .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-fA-F]+;/gi, (entity) => {
            if (entity in HTML_ENTITIES) return HTML_ENTITIES[entity]
            const numMatch = entity.match(/&#(\d+);/)
            if (numMatch) return String.fromCharCode(parseInt(numMatch[1], 10))
            const hexMatch = entity.match(/&#x([0-9a-fA-F]+);/i)
            if (hexMatch) return String.fromCharCode(parseInt(hexMatch[1], 16))
            return entity
        })
}

/**
 * 외부 출처(뉴스·커뮤니티 제목 등) 텍스트를 HTML에 안전하게 끼워넣기 위한 이스케이프.
 * 반드시 &부터 먼저 치환해야 다른 엔티티가 다시 이스케이프되는 걸 방지한다.
 *
 * 예시:
 *   escapeHtml('<script>alert(1)</script>') // → '&lt;script&gt;alert(1)&lt;/script&gt;'
 */
export function escapeHtml(str: string | null | undefined): string {
    if (!str) return ''
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
