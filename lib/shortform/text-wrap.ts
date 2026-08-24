/**
 * lib/shortform/text-wrap.ts
 *
 * 자막 줄바꿈 로직 (서버 렌더링 generate-scenes.ts / 관리자 입력 UI 공용).
 * 노드 전용 의존성이 없어 클라이언트 컴포넌트에서도 그대로 import 가능.
 */

export const DESC_MAX_CHARS_PER_LINE = 13
export const DESC_SAFE_MAX_LINES = 5

/** 단어 경계 기준 줄바꿈 + 마지막 줄 orphan 방지. \n 명시 줄바꿈 지원. */
export function wordWrapLines(text: string, maxCharsPerLine: number): string[] {
    // \n 포함 시 각 세그먼트를 독립적으로 처리
    const segments = text.split('\n').map(s => s.trim()).filter(s => s.length > 0)
    if (segments.length === 0) return ['']

    const allLines: string[] = []

    for (const segment of segments) {
        const words = segment.split(' ').filter(w => w.length > 0)
        if (words.length === 0) continue

        const lines: string[] = []
        let current = ''

        for (const word of words) {
            // 단일 어절이 maxCharsPerLine 초과 시 강제 분할
            if (word.length > maxCharsPerLine) {
                if (current) { lines.push(current); current = '' }
                for (let i = 0; i < word.length; i += maxCharsPerLine) {
                    lines.push(word.slice(i, i + maxCharsPerLine))
                }
                continue
            }
            const test = current ? `${current} ${word}` : word
            if (test.length <= maxCharsPerLine) {
                current = test
            } else {
                if (current) lines.push(current)
                current = word
            }
        }
        if (current) lines.push(current)

        // 마지막 줄이 단어 1개(orphan)이면 앞 줄 마지막 단어를 당겨서 균형 맞춤
        if (lines.length >= 2) {
            const lastLine = lines[lines.length - 1]
            if (lastLine.split(' ').filter(Boolean).length === 1) {
                const prevWords = lines[lines.length - 2].split(' ')
                if (prevWords.length >= 2) {
                    const moved = prevWords[prevWords.length - 1]
                    const newPrev = prevWords.slice(0, -1).join(' ')
                    const newLast = `${moved} ${lastLine}`
                    if (newPrev.length <= maxCharsPerLine && newLast.length <= maxCharsPerLine) {
                        lines[lines.length - 2] = newPrev
                        lines[lines.length - 1] = newLast
                    }
                }
            }
        }

        allLines.push(...lines)
    }

    return allLines.length > 0 ? allLines : ['']
}
