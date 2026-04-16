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

const WIDTH = 1080
const HEIGHT = 1920

// ── 레이아웃 단위 ──────────────────────────────────────────────
const LOGO_W = 240
const LOGO_H = 95
const LOGO_TEXT_GAP = 55     // 로고 bottom → 타이틀 top
const TITLE_FONTSIZE = 92
const TITLE_LINE_HEIGHT = 130  // 타이틀 줄 간격 (폰트 92 × 1.41)
const TEXT_GAP = 56          // 타이틀 bottom → 설명 top
const DESC_FONTSIZE = 54
const DESC_LINE_HEIGHT = 82   // 설명 줄 간격 (폰트 54 × 1.52)
const BUTTON_GAP = 80        // 설명 bottom → 버튼 top (scene 3만)
const BUTTON_H = 130
const BUTTON_W = 660
// ─────────────────────────────────────────────────────────────

interface SceneLayout {
    logoY: number
    titleStartY: number
    descStartY: number
    buttonY: number   // -1 if scene 1 or 2
}

/** 단어 경계 기준 줄바꿈 */
function wordWrapLines(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(' ').filter(w => w.length > 0)
    if (words.length === 0) return ['']
    const lines: string[] = []
    let current = ''
    for (const word of words) {
        const test = current ? `${current} ${word}` : word
        if (test.length <= maxCharsPerLine) {
            current = test
        } else {
            if (current) lines.push(current)
            current = word
        }
    }
    if (current) lines.push(current)
    return lines
}

/**
 * 로고·타이틀·설명·버튼을 하나의 그룹으로 수직 중앙 정렬.
 * scene 3에만 버튼 포함.
 */
function computeLayout(title: string, desc: string, sceneNumber: number): SceneLayout {
    const titleLineCount = Math.max(1, wordWrapLines(title, 13).length)
    const descLineCount = Math.max(1, wordWrapLines(desc, 16).length)

    const titleHeight = (titleLineCount - 1) * TITLE_LINE_HEIGHT + TITLE_FONTSIZE
    const descHeight = (descLineCount - 1) * DESC_LINE_HEIGHT + DESC_FONTSIZE

    let totalHeight = LOGO_H + LOGO_TEXT_GAP + titleHeight + TEXT_GAP + descHeight
    if (sceneNumber === 3) totalHeight += BUTTON_GAP + BUTTON_H

    const startY = Math.floor((HEIGHT - totalHeight) / 2)

    const logoY = startY
    const titleStartY = startY + LOGO_H + LOGO_TEXT_GAP
    const descStartY = titleStartY + titleHeight + TEXT_GAP
    const buttonY = sceneNumber === 3 ? descStartY + descHeight + BUTTON_GAP : -1

    return { logoY, titleStartY, descStartY, buttonY }
}

function escapeDrawtext(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/:/g, '\\:')
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function getLogoBase64(): string {
    try {
        const logoPath = join(process.cwd(), 'public', 'whynali-logo.png')
        return `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
    } catch {
        return ''
    }
}

// 폰트 data URI 캐시 (최초 1회만 읽음)
let _fontDataUriCache: string | null = null

function getFontDataUri(): string {
    if (_fontDataUriCache !== null) return _fontDataUriCache
    try {
        const fontPath = join(process.cwd(), 'public', 'fonts', 'Pretendard-Bold.ttf')
        _fontDataUriCache = `data:font/truetype;base64,${readFileSync(fontPath).toString('base64')}`
    } catch {
        console.warn('[generate-scenes] Pretendard-Bold.ttf 없음 — 시스템 폰트 사용')
        _fontDataUriCache = ''
    }
    return _fontDataUriCache
}

/**
 * 타이핑 애니메이션 한 프레임 렌더링 (Sharp + SVG).
 * drawtext 없이 텍스트 오버레이 PNG 생성.
 */
async function renderTypingStatePNG(
    titleVisible: string,
    descVisible: string,
    sceneNumber: number,
    layout: SceneLayout,
    fontDataUri: string
): Promise<Buffer> {
    const fontFamily = fontDataUri ? 'Pretendard' : 'Arial, sans-serif'
    const fontFaceStyle = fontDataUri
        ? `@font-face { font-family: 'Pretendard'; src: url('${fontDataUri}') format('truetype'); }`
        : ''

    const titleLines = titleVisible ? wordWrapLines(titleVisible, 13) : []
    const descLines = descVisible ? wordWrapLines(descVisible, 16) : []

    const elements: string[] = []

    // 타이틀 라인 (스트로크 먼저 → 위에 fill 렌더링)
    for (let i = 0; i < titleLines.length; i++) {
        const x = WIDTH / 2
        const y = layout.titleStartY + i * TITLE_LINE_HEIGHT + TITLE_FONTSIZE
        const esc = escapeXml(titleLines[i])
        elements.push(
            `<text x="${x}" y="${y}" text-anchor="middle" font-family="${fontFamily}" ` +
            `font-size="${TITLE_FONTSIZE}" fill="none" stroke="black" stroke-width="8" stroke-linejoin="round">${esc}</text>`
        )
        elements.push(
            `<text x="${x}" y="${y}" text-anchor="middle" font-family="${fontFamily}" ` +
            `font-size="${TITLE_FONTSIZE}" fill="white">${esc}</text>`
        )
    }

    // 설명 라인 (스트로크 먼저 → 위에 fill 렌더링)
    for (let i = 0; i < descLines.length; i++) {
        const x = WIDTH / 2
        const y = layout.descStartY + i * DESC_LINE_HEIGHT + DESC_FONTSIZE
        const esc = escapeXml(descLines[i])
        elements.push(
            `<text x="${x}" y="${y}" text-anchor="middle" font-family="${fontFamily}" ` +
            `font-size="${DESC_FONTSIZE}" fill="none" stroke="black" stroke-width="5" stroke-linejoin="round">${esc}</text>`
        )
        elements.push(
            `<text x="${x}" y="${y}" text-anchor="middle" font-family="${fontFamily}" ` +
            `font-size="${DESC_FONTSIZE}" fill="#E5E7EB">${esc}</text>`
        )
    }

    // CTA 버튼 텍스트 (씬 3만, 항상 표시)
    if (sceneNumber === 3 && layout.buttonY > 0) {
        const x = WIDTH / 2
        const y = layout.buttonY + Math.floor(BUTTON_H / 2) + 20
        elements.push(
            `<text x="${x}" y="${y}" text-anchor="middle" font-family="${fontFamily}" ` +
            `font-size="58" fill="white">${escapeXml('지금 바로 확인하기')}</text>`
        )
    }

    const svg =
        `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
        (fontFaceStyle ? `<defs><style>${fontFaceStyle}</style></defs>` : '') +
        elements.join('') +
        `</svg>`

    return sharp(Buffer.from(svg)).png().toBuffer()
}

/**
 * 씬별 타이핑 애니메이션 프레임 배열 생성 (drawtext 대체).
 * 단어 하나씩 누적해서 보여주는 PNG 시퀀스 반환.
 *
 * @returns { buffer, duration }[] — 각 프레임 PNG와 표시 시간(초)
 */
export async function createTypingFrames(
    title: string,
    desc: string,
    sceneNumber: number,
    sceneDuration: number
): Promise<{ buffer: Buffer; duration: number }[]> {
    const layout = computeLayout(title, desc, sceneNumber)
    const fontDataUri = getFontDataUri()

    const titleWords = title.split(' ').filter(w => w.length > 0)
    const descWords = desc.split(' ').filter(w => w.length > 0)
    const totalWords = titleWords.length + descWords.length

    if (totalWords === 0) {
        const empty = await renderTypingStatePNG('', '', sceneNumber, layout, fontDataUri)
        return [{ buffer: empty, duration: sceneDuration }]
    }

    const wordDelay = Math.min(0.4, (sceneDuration * 0.78) / totalWords)
    const frames: { buffer: Buffer; duration: number }[] = []

    for (let n = 1; n <= totalWords; n++) {
        const titleVisible = titleWords.slice(0, Math.min(n, titleWords.length)).join(' ')
        const descVisible = n > titleWords.length
            ? descWords.slice(0, n - titleWords.length).join(' ')
            : ''

        const buffer = await renderTypingStatePNG(titleVisible, descVisible, sceneNumber, layout, fontDataUri)
        const isLast = n === totalWords
        const duration = isLast
            ? Math.max(sceneDuration - (n - 1) * wordDelay, wordDelay)
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
            <rect width="${WIDTH}" height="${HEIGHT}" fill="black" opacity="0.35"/>
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
    const ctaX = Math.floor(WIDTH / 2 - BUTTON_W / 2)

    const svg = `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            ${logoBase64 ? `<image href="${logoBase64}" x="${logoX}" y="${layout.logoY}" width="${LOGO_W}" height="${LOGO_H}" preserveAspectRatio="xMidYMid meet"/>` : ''}
            ${sceneNumber === 3 && layout.buttonY > 0 ? `<rect x="${ctaX}" y="${layout.buttonY}" width="${BUTTON_W}" height="${BUTTON_H}" rx="${Math.floor(BUTTON_H / 2)}" fill="#1E40AF"/>` : ''}
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
 * CTA 버튼 텍스트는 scene 3에서 정적으로 표시 (타이핑 없음).
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

    // CTA 버튼 텍스트: scene 3만, 정적 (타이핑 없음, t=0부터 표시)
    if (sceneNumber === 3 && layout.buttonY > 0) {
        const btnCenterY = layout.buttonY + Math.floor(BUTTON_H / 2)
        filters.push(
            `drawtext=${ffmpegFont}` +
            `text='지금 바로 확인하기':` +
            `x=(w-tw)/2:y=${btnCenterY}-th/2:` +
            `fontsize=58:fontcolor=white`
        )
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
            `fontsize=80:fontcolor=white:borderw=4:bordercolor=black:enable='${enableExpr}'`
        )
    })
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
