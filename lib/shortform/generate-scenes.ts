/**
 * lib/shortform/generate-scenes.ts
 *
 * 3개 Scene 이미지 생성 (구조 레이어 + drawtext 필터)
 * - Sharp: 로고 이미지 + CTA 버튼 rect (scene 3만)
 * - FFmpeg drawtext: 타이틀·설명 (word-by-word 타이핑 효과)
 * - computeLayout: 로고/텍스트/버튼을 수직 중앙 그룹으로 배치
 */

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'
import { downloadImage } from './fetch-stock-images'

const WIDTH = 720
const HEIGHT = 1280

// ── 레이아웃 단위 (720x1280 기준, 1080x1920 대비 ×0.667) ──────
const LOGO_W = 187
const LOGO_H = 73
const LOGO_TOP_Y = 93
const TITLE_FONTSIZE = 61
const TITLE_LINE_HEIGHT = 87

const DESC_FONTSIZE = 43
const DESC_LINE_HEIGHT = 65
// ─────────────────────────────────────────────────────────────

interface SceneLayout {
    logoY: number
    titleStartY: number
    descStartY: number
}

/** 단어 경계 기준 줄바꿈 + 마지막 줄 orphan 방지. \n 명시 줄바꿈 지원. */
function wordWrapLines(text: string, maxCharsPerLine: number): string[] {
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

        // 마지막 줄이 4자 이하(orphan)이면 앞 줄 마지막 단어를 당겨서 균형 맞춤
        if (lines.length >= 2) {
            const lastLine = lines[lines.length - 1]
            if (lastLine.length <= 4) {
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

/**
 * 상단: 로고 + 타이틀 (씬1,2,3 공통 고정)
 * 하단: 이슈 설명 + CTA 버튼 (씬3만 버튼)
 */
function computeLayout(_title: string, _desc: string, _sceneNumber?: number): SceneLayout {
    const logoY = LOGO_TOP_Y
    const titleStartY = LOGO_TOP_Y + LOGO_H + 60
    const descStartY = Math.floor(HEIGHT * 0.60)
    return { logoY, titleStartY, descStartY }
}

function escapeDrawtext(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/:/g, '\\:')
}


function getLogoBase64(): string {
    try {
        const logoPath = join(process.cwd(), 'public', 'whynali-logo.png')
        return `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
    } catch {
        return ''
    }
}

// opentype.js 폰트 캐시 (최초 1회만 로드)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _otFontCache: any = null

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const opentype = require('opentype.js') as any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOTFont(): any {
    if (_otFontCache) return _otFontCache
    try {
        const fontPath = join(process.cwd(), 'public', 'fonts', 'Pretendard-Bold.ttf')
        _otFontCache = opentype.loadSync(fontPath)
        return _otFontCache
    } catch {
        console.warn('[generate-scenes] opentype 폰트 로드 실패')
        return null
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addLinePaths(
    font: any,
    svgPaths: string[],
    line: string, x: number, y: number,
    fontSize: number, fillColor: string, strokeW: number,
    boldBoost = true
) {
    if (strokeW > 0) {
        const sp = font.getPath(line, x, y, fontSize)
        sp.fill = 'none'
        sp.stroke = '#000000'
        sp.strokeWidth = strokeW
        svgPaths.push(sp.toSVG(2))
    }
    if (boldBoost) {
        const bp = font.getPath(line, x, y, fontSize)
        bp.fill = fillColor
        bp.stroke = '#000000'
        bp.strokeWidth = 10
        svgPaths.push(bp.toSVG(2))
    }
    const fp = font.getPath(line, x, y, fontSize)
    fp.fill = fillColor
    fp.stroke = null
    svgPaths.push(fp.toSVG(2))
}

/**
 * 타이핑 애니메이션 한 프레임 렌더링.
 * - 씬1: titleFinalLines 전달 시 타이틀+설명 순서로 애니메이션
 * - 씬2,3: descFinalLines만 애니메이션 (타이틀은 정적 레이어에서 처리)
 */
async function renderTypingStatePNG(
    visibleCount: number,
    layout: SceneLayout,
    descFinalLines: string[],
    titleFinalLines: string[] = [],
    titleWordCount = 0
): Promise<Buffer> {
    const font = getOTFont()
    const svgPaths: string[] = []

    if (font) {
        const ascT = Math.round(font.ascender * TITLE_FONTSIZE / font.unitsPerEm)
        const ascD = Math.round(font.ascender * DESC_FONTSIZE / font.unitsPerEm)

        // 타이틀 애니메이션 (씬1만, titleFinalLines 전달 시)
        if (titleFinalLines.length > 0) {
            let rendered = 0
            for (let i = 0; i < titleFinalLines.length; i++) {
                if (rendered >= visibleCount) break
                const lineWords = titleFinalLines[i].split(' ').filter(Boolean)
                const visibleInLine = Math.min(lineWords.length, visibleCount - rendered)
                const text = lineWords.slice(0, visibleInLine).join(' ')
                if (text.trim()) {
                    const w = font.getAdvanceWidth(text, TITLE_FONTSIZE)
                    const x = Math.floor((WIDTH - w) / 2)
                    const y = layout.titleStartY + i * TITLE_LINE_HEIGHT + ascT
                    addLinePaths(font, svgPaths, text, x, y, TITLE_FONTSIZE, '#ffffff', 8)
                }
                rendered += lineWords.length
            }
        }

        // 설명: 줄 위치 고정, 단어 수만큼 표시 (타이틀 완료 후 시작)
        const descVisible = Math.max(0, visibleCount - titleWordCount)
        let rendered = 0
        for (let i = 0; i < descFinalLines.length; i++) {
            if (rendered >= descVisible) break
            const lineWords = descFinalLines[i].split(' ').filter(Boolean)
            const visibleInLine = Math.min(lineWords.length, descVisible - rendered)
            const text = lineWords.slice(0, visibleInLine).join(' ')
            if (text.trim()) {
                const w = font.getAdvanceWidth(text, DESC_FONTSIZE)
                const x = Math.floor((WIDTH - w) / 2)
                const y = layout.descStartY + i * DESC_LINE_HEIGHT + ascD
                addLinePaths(font, svgPaths, text, x, y, DESC_FONTSIZE, '#E5E7EB', 5)
            }
            rendered += lineWords.length
        }

    }

    const svg =
        `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
        svgPaths.join('') +
        `</svg>`

    return sharp(Buffer.from(svg)).png().toBuffer()
}

/**
 * 씬별 타이핑 애니메이션 프레임 배열 생성.
 * 최종 줄 구조를 미리 계산 후 고정 → 줄 점프 없이 단어만 순차 등장.
 */
export async function createTypingFrames(
    title: string,
    desc: string,
    sceneNumber: number,
    sceneDuration: number
): Promise<{ buffer: Buffer; duration: number }[]> {
    const layout = computeLayout(title, desc, sceneNumber)

    // 씬1: 타이틀+설명 모두 애니메이션 / 씬2,3: 설명만 애니메이션 (타이틀은 정적 레이어)
    const titleFinalLines = sceneNumber === 1 && title ? wordWrapLines(title, 13) : []
    const descFinalLines = desc ? wordWrapLines(desc, 16) : []

    const titleWords = titleFinalLines.flatMap(l => l.split(' ').filter(Boolean))
    const descWords = descFinalLines.flatMap(l => l.split(' ').filter(Boolean))
    const totalWords = titleWords.length + descWords.length

    if (totalWords === 0) {
        const empty = await renderTypingStatePNG(0, layout, [], titleFinalLines, titleWords.length)
        return [{ buffer: empty, duration: sceneDuration }]
    }

    const TEXT_START_DELAY = 0.15
    const wordDelay = Math.min(0.33, (sceneDuration * 0.85) / totalWords)
    const frames: { buffer: Buffer; duration: number }[] = []

    frames.push({ buffer: await renderTypingStatePNG(0, layout, [], titleFinalLines, titleWords.length), duration: TEXT_START_DELAY })

    for (let n = 1; n <= totalWords; n++) {
        const isLast = n === totalWords
        const buffer = await renderTypingStatePNG(n, layout, descFinalLines, titleFinalLines, titleWords.length)
        const duration = isLast
            ? Math.max(sceneDuration - TEXT_START_DELAY - (n - 1) * wordDelay, wordDelay)
            : wordDelay
        frames.push({ buffer, duration })
    }

    return frames
}

/**
 * 단어 단위 타이핑 효과 drawtext 필터 배열 생성.
 */
function buildTypingFilters(
    text: string,
    maxCharsPerLine: number,
    startY: number,
    lineHeight: number,
    fontSize: number,
    fontColor: string,
    borderWidth: number,
    ffmpegFont: string,
    timeOffset: number,
    wordDelay: number
): { filters: string[], duration: number } {
    const words = text.split(' ').filter(w => w.length > 0)
    if (words.length === 0) return { filters: [], duration: 0 }

    // 최종 줄 배치 기준으로 각 단어의 줄 번호 미리 계산
    const wordLineIdx: number[] = []
    let lineIdx = 0
    let lineLen = 0
    for (const word of words) {
        if (!lineLen) {
            lineLen = word.length
        } else if (lineLen + 1 + word.length <= maxCharsPerLine) {
            lineLen += 1 + word.length
        } else {
            lineIdx++
            lineLen = word.length
        }
        wordLineIdx.push(lineIdx)
    }

    const filters: string[] = []
    const borderPart = borderWidth > 0 ? `borderw=${borderWidth}:bordercolor=black:` : ''

    for (let n = 1; n <= words.length; n++) {
        const stateStart = timeOffset + (n - 1) * wordDelay
        const stateEnd = n < words.length ? timeOffset + n * wordDelay : null
        const enableExpr = stateEnd !== null
            ? `between(t,${stateStart.toFixed(3)},${stateEnd.toFixed(3)})`
            : `gte(t,${stateStart.toFixed(3)})`

        const lineWords = new Map<number, string[]>()
        for (let i = 0; i < n; i++) {
            const li = wordLineIdx[i]
            if (!lineWords.has(li)) lineWords.set(li, [])
            lineWords.get(li)!.push(words[i])
        }

        for (const [li, lw] of lineWords) {
            filters.push(
                `drawtext=${ffmpegFont}` +
                `text='${escapeDrawtext(lw.join(' '))}':` +
                `x=(w-tw)/2:y=${startY + li * lineHeight}:` +
                `fontsize=${fontSize}:fontcolor=${fontColor}:` +
                `${borderPart}` +
                `enable='${enableExpr}'`
            )
        }
    }

    return { filters, duration: words.length * wordDelay }
}

// ─────────────────────────────────────────────────────────────

/**
 * 배경 이미지만 생성 (텍스트 없이)
 */
export async function createBackgroundScene(backgroundUrl: string): Promise<Buffer> {
    const bgBuffer = await downloadImage(backgroundUrl)

    const background = await sharp(bgBuffer)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
        .modulate({ brightness: 0.65 })
        .toBuffer()

    const svg = `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${WIDTH}" height="${HEIGHT}" fill="black" opacity="0.2"/>
        </svg>
    `

    return await sharp(background)
        .composite([{ input: Buffer.from(svg), blend: 'over' }])
        .png()
        .toBuffer()
}

/**
 * Scene 구조 레이어 생성 (투명 배경).
 * 로고 + CTA 버튼 rect (scene 3만) — 위치는 computeLayout 기준.
 *
 * @param sceneNumber - 씬 번호
 * @param title - 타이틀 (레이아웃 계산용)
 * @param desc - 설명 (레이아웃 계산용)
 */
export async function createSceneTextOverlay(
    sceneNumber: number,
    title: string = '',
    desc: string = ''
): Promise<Buffer> {
    const layout = computeLayout(title, desc, sceneNumber)
    const logoBase64 = getLogoBase64()
    const logoX = Math.floor(WIDTH / 2 - LOGO_W / 2)
    const font = getOTFont()
    const svgPaths: string[] = []

    // 타이틀 정적 렌더링 (씬2,3만 — 씬1은 타이핑 애니메이션으로 처리)
    if (font && title && sceneNumber !== 1) {
        const titleLines = wordWrapLines(title, 13)
        const ascT = Math.round(font.ascender * TITLE_FONTSIZE / font.unitsPerEm)
        for (let i = 0; i < titleLines.length; i++) {
            const line = titleLines[i]
            if (!line.trim()) continue
            const w = font.getAdvanceWidth(line, TITLE_FONTSIZE)
            const x = Math.floor((WIDTH - w) / 2)
            const y = layout.titleStartY + i * TITLE_LINE_HEIGHT + ascT
            addLinePaths(font, svgPaths, line, x, y, TITLE_FONTSIZE, '#ffffff', 8)
        }
    }

    const svg = `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            ${logoBase64 ? `<image href="${logoBase64}" x="${logoX}" y="${layout.logoY}" width="${LOGO_W}" height="${LOGO_H}" preserveAspectRatio="xMidYMid meet"/>` : ''}
            ${svgPaths.join('')}
        </svg>
    `

    return await sharp({
        create: {
            width: WIDTH,
            height: HEIGHT,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite([{ input: Buffer.from(svg), blend: 'over' }])
        .png()
        .toBuffer()
}

/**
 * Scene 텍스트를 FFmpeg drawtext 필터 배열로 반환.
 * computeLayout 기준으로 타이틀·설명 위치 결정.
 */
export function getSceneTextDrawtextFilters(
    title: string,
    desc: string,
    sceneNumber: number,
    fontPath: string,
    typing: boolean = true,
    sceneDuration: number = 3.67
): string[] {
    const filters: string[] = []
    const layout = computeLayout(title, desc, sceneNumber)

    const ffmpegFont = fontPath
        ? `fontfile='${fontPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:')}':`
        : ''

    const titleWords = title.split(' ').filter(w => w.length > 0)
    const descWords = desc.split(' ').filter(w => w.length > 0)
    const totalWords = titleWords.length + descWords.length
    const wordDelay = totalWords > 0
        ? Math.min(0.4, (sceneDuration * 0.78) / totalWords)
        : 0.35

    if (typing) {
        // 타이틀 word-by-word
        const titleResult = buildTypingFilters(
            title, 13,
            layout.titleStartY, TITLE_LINE_HEIGHT, TITLE_FONTSIZE,
            'white', 5, ffmpegFont,
            0, wordDelay
        )
        filters.push(...titleResult.filters)

        // 설명 word-by-word (타이틀 완료 후 시작)
        const descResult = buildTypingFilters(
            desc, 16,
            layout.descStartY, DESC_LINE_HEIGHT, DESC_FONTSIZE,
            '0xE5E7EB', 3, ffmpegFont,
            titleResult.duration, wordDelay
        )
        filters.push(...descResult.filters)
    } else {
        wordWrapLines(title, 13).forEach((line, i) => {
            filters.push(
                `drawtext=${ffmpegFont}` +
                `text='${escapeDrawtext(line)}':` +
                `x=(w-tw)/2:y=${layout.titleStartY + i * TITLE_LINE_HEIGHT}:` +
                `fontsize=${TITLE_FONTSIZE}:fontcolor=white:borderw=5:bordercolor=black`
            )
        })
        wordWrapLines(desc, 16).forEach((line, i) => {
            filters.push(
                `drawtext=${ffmpegFont}` +
                `text='${escapeDrawtext(line)}':` +
                `x=(w-tw)/2:y=${layout.descStartY + i * DESC_LINE_HEIGHT}:` +
                `fontsize=${DESC_FONTSIZE}:fontcolor=0xE5E7EB:borderw=3:bordercolor=black`
            )
        })
    }

    return filters
}

/**
 * FFmpeg drawtext 타이핑 효과 (단어 단위 누적 — 레거시).
 * @deprecated getSceneTextDrawtextFilters(typing=true) 사용 권장
 */
export function getTypingDrawtextFilters(
    text: string,
    sceneNumber: number,
    sceneStartOffset: number,
    sceneDuration: number,
    fontPath: string
): string[] {
    const words = text.split(' ').filter(w => w.length > 0)
    if (words.length === 0) return []

    const wordDuration = sceneDuration / words.length
    const yMap: Record<number, number> = { 1: 550, 2: 860, 3: 720 }
    const y = yMap[sceneNumber] ?? 860

    const fontfileParam = fontPath
        ? `fontfile='${fontPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:')}':`
        : ''

    return words.map((_, i) => {
        const cumulativeText = words.slice(0, i + 1).join(' ')
        const startTime = sceneStartOffset + i * wordDuration
        const isLast = i === words.length - 1
        const endTime = isLast ? null : sceneStartOffset + (i + 1) * wordDuration
        const enableExpr = endTime !== null
            ? `between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})`
            : `gte(t,${startTime.toFixed(3)})`
        const escapedText = cumulativeText
            .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')

        return (
            `drawtext=${fontfileParam}` +
            `text='${escapedText}':x=(w-tw)/2:y=${y}:` +
            `fontsize=53:fontcolor=white:borderw=3:bordercolor=black:enable='${enableExpr}'`
        )
    })
}

// ── 검색 씬 레이아웃 (720x1280 기준, ×0.667) ─────────────────
const SEARCH_BAR_W = 560
const SEARCH_BAR_H = 87
const SEARCH_BAR_X = Math.floor((WIDTH - SEARCH_BAR_W) / 2)
const SEARCH_BAR_Y = 667
const SEARCH_BAR_RX = 43
const MAG_CX = SEARCH_BAR_X + 39
const MAG_R = 12
const SEARCH_TEXT_X = SEARCH_BAR_X + 79
const SEARCH_TEXT_FONTSIZE = 43
const SEARCH_HEADLINE = '더 자세히 알고 싶다면?'
const SEARCH_HEADLINE_FONTSIZE = 48
const SEARCH_SUBTITLE_FONTSIZE = 35
const SEARCH_SUBTITLE_Y1 = SEARCH_BAR_Y + SEARCH_BAR_H + 47
const SEARCH_SUBTITLE_Y2 = SEARCH_SUBTITLE_Y1 + 80
const SEARCH_QUERY = '왜난리'
const SEARCH_SUBTITLE_LINE1 = "지금 검색창에"
const SEARCH_SUBTITLE_LINE2 = "'왜난리'를 검색하세요"
// ─────────────────────────────────────────────────────────────

export async function createSearchSceneOverlay(): Promise<Buffer> {
    const font = getOTFont()
    const logoBase64 = getLogoBase64()
    const logoX = Math.floor(WIDTH / 2 - LOGO_W / 2)

    const magCY = SEARCH_BAR_Y + Math.floor(SEARCH_BAR_H / 2)
    const handleLen = Math.round(MAG_R * 0.8)
    const handleX1 = MAG_CX + Math.floor(MAG_R * 0.72)
    const handleY1 = magCY + Math.floor(MAG_R * 0.72)
    const handleX2 = handleX1 + handleLen
    const handleY2 = handleY1 + handleLen

    const svgPaths: string[] = []
    if (font) {
        const descender = Math.round(Math.abs(font.descender) * SEARCH_HEADLINE_FONTSIZE / font.unitsPerEm)
        const headlineBaselineY = SEARCH_BAR_Y - 60 - descender
        const headlineW = font.getAdvanceWidth(SEARCH_HEADLINE, SEARCH_HEADLINE_FONTSIZE)
        const headlineX = Math.floor((WIDTH - headlineW) / 2)
        addLinePaths(font, svgPaths, SEARCH_HEADLINE, headlineX, headlineBaselineY, SEARCH_HEADLINE_FONTSIZE, 'white', 4)
    }

    const svg = `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            ${logoBase64 ? `<image href="${logoBase64}" x="${logoX}" y="${LOGO_TOP_Y}" width="${LOGO_W}" height="${LOGO_H}" preserveAspectRatio="xMidYMid meet"/>` : ''}
            <rect x="${SEARCH_BAR_X}" y="${SEARCH_BAR_Y}" width="${SEARCH_BAR_W}" height="${SEARCH_BAR_H}" rx="${SEARCH_BAR_RX}" fill="white" opacity="0.93"/>
            <circle cx="${MAG_CX}" cy="${magCY}" r="${MAG_R}" fill="none" stroke="#666666" stroke-width="4"/>
            <line x1="${handleX1}" y1="${handleY1}" x2="${handleX2}" y2="${handleY2}" stroke="#666666" stroke-width="4" stroke-linecap="round"/>
            ${svgPaths.join('')}
        </svg>
    `

    return await sharp({
        create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
        .composite([{ input: Buffer.from(svg), blend: 'over' }])
        .png()
        .toBuffer()
}

export async function createSearchTypingFrames(
    sceneDuration: number
): Promise<{ buffer: Buffer; duration: number }[]> {
    const font = getOTFont()
    const searchChars = SEARCH_QUERY.split('')
    const sub1Words = SEARCH_SUBTITLE_LINE1.split(' ')
    const sub2Words = SEARCH_SUBTITLE_LINE2.split(' ')
    const CHAR_DELAY = 0.28
    const WORD_DELAY = 0.32
    const TEXT_START_DELAY = 0.20
    const totalAnimTime = searchChars.length * CHAR_DELAY + (sub1Words.length + sub2Words.length) * WORD_DELAY
    const holdTime = Math.max(sceneDuration - TEXT_START_DELAY - totalAnimTime, 0.5)

    const magCY = SEARCH_BAR_Y + Math.floor(SEARCH_BAR_H / 2)

    async function renderFrame(visibleChars: number, visibleSub1: number, visibleSub2: number): Promise<Buffer> {
        const svgPaths: string[] = []
        const svgElements: string[] = []

        if (font) {
            const ascS = Math.round(font.ascender * SEARCH_TEXT_FONTSIZE / font.unitsPerEm)
            const descS = Math.round(Math.abs(font.descender) * SEARCH_TEXT_FONTSIZE / font.unitsPerEm)
            const textY = magCY + Math.floor((ascS - descS) / 2)
            const cursorH = ascS + descS
            const cursorTopY = textY - ascS

            let cursorX = SEARCH_TEXT_X
            if (visibleChars > 0) {
                const text = searchChars.slice(0, visibleChars).join('')
                const fp = font.getPath(text, SEARCH_TEXT_X, textY, SEARCH_TEXT_FONTSIZE)
                fp.fill = '#1a1a1a'
                fp.stroke = null
                svgPaths.push(fp.toSVG(2))
                cursorX = SEARCH_TEXT_X + Math.round(font.getAdvanceWidth(text, SEARCH_TEXT_FONTSIZE)) + 4
            }

            svgElements.push(
                `<rect x="${cursorX}" y="${cursorTopY}" width="3" height="${cursorH}" fill="#1a1a1a" rx="1"/>`
            )

            const ascSub = Math.round(font.ascender * SEARCH_SUBTITLE_FONTSIZE / font.unitsPerEm)

            if (visibleSub1 > 0) {
                const subText1 = sub1Words.slice(0, visibleSub1).join(' ')
                const w1 = font.getAdvanceWidth(subText1, SEARCH_SUBTITLE_FONTSIZE)
                const x1 = Math.floor((WIDTH - w1) / 2)
                addLinePaths(font, svgPaths, subText1, x1, SEARCH_SUBTITLE_Y1 + ascSub, SEARCH_SUBTITLE_FONTSIZE, '#E5E7EB', 5)
            }

            if (visibleSub2 > 0) {
                const subText2 = sub2Words.slice(0, visibleSub2).join(' ')
                const w2 = font.getAdvanceWidth(subText2, SEARCH_SUBTITLE_FONTSIZE)
                const x2 = Math.floor((WIDTH - w2) / 2)
                addLinePaths(font, svgPaths, subText2, x2, SEARCH_SUBTITLE_Y2 + ascSub, SEARCH_SUBTITLE_FONTSIZE, '#E5E7EB', 5)
            }
        }

        const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${svgPaths.join('')}${svgElements.join('')}</svg>`
        return sharp(Buffer.from(svg)).png().toBuffer()
    }

    const frames: { buffer: Buffer; duration: number }[] = []
    frames.push({ buffer: await renderFrame(0, 0, 0), duration: TEXT_START_DELAY })
    for (let i = 1; i <= searchChars.length; i++) {
        frames.push({ buffer: await renderFrame(i, 0, 0), duration: CHAR_DELAY })
    }
    for (let i = 1; i <= sub1Words.length; i++) {
        frames.push({ buffer: await renderFrame(searchChars.length, i, 0), duration: WORD_DELAY })
    }
    for (let i = 1; i <= sub2Words.length; i++) {
        const isLast = i === sub2Words.length
        frames.push({ buffer: await renderFrame(searchChars.length, sub1Words.length, i), duration: isLast ? holdTime : WORD_DELAY })
    }

    return frames
}

/** @deprecated */
export async function createTextOverlay(_title: string): Promise<Buffer> {
    return createSceneTextOverlay(1)
}

export async function createScene1(backgroundUrl: string, _c: string): Promise<Buffer> {
    return createBackgroundScene(backgroundUrl)
}

export async function createScene2(backgroundUrl: string, _t: string, _s: string, _h: string): Promise<Buffer> {
    return createBackgroundScene(backgroundUrl)
}

export async function createScene3(backgroundUrl: string): Promise<Buffer> {
    return createBackgroundScene(backgroundUrl)
}
