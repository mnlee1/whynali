/**
 * lib/utils/truncate-to-sentence.ts
 *
 * 최대 길이 안에서 마지막 문장이 자연스럽게 끝나는 지점(. ! ?)까지만 잘라 완결된 문장으로 만든다.
 * 문장부호를 못 찾으면(너무 긴 단문 등), 단어 중간이 아니라 마지막 공백(단어 경계)에서 잘라
 * "…"를 붙인다 — 뉴스 헤드라인처럼 절 단위로 끊기게 하기 위함.
 */

export function truncateToSentence(text: string, maxLength: number): string {
    const trimmed = text.trim()
    if (trimmed.length <= maxLength) return trimmed

    const window = trimmed.slice(0, maxLength)
    const boundary = Math.max(window.lastIndexOf('.'), window.lastIndexOf('!'), window.lastIndexOf('?'))
    if (boundary >= 10) return trimmed.slice(0, boundary + 1)

    const lastSpace = window.lastIndexOf(' ')
    const safeCut = (lastSpace >= 10 ? window.slice(0, lastSpace) : window).trimEnd()

    // 원문에 이미 "…"가 있으면(뉴스 헤드라인풍 문장 등) 또 붙이지 않는다 — "…" 중복 방지.
    if (safeCut.includes('…')) return safeCut

    return `${safeCut}…`
}
