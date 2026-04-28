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
const LOGO_W = 280
const LOGO_H = 110
const LOGO_TOP_Y = 140       // 로고 상단 고정 Y
const TITLE_FONTSIZE = 92
const TITLE_LINE_HEIGHT = 130  // 타이틀 줄 간격 (폰트 92 × 1.41)

const DESC_FONTSIZE = 64
const DESC_LINE_HEIGHT = 97   // 설명 줄 간격 (폰트 64 × 1.52)
const BUTTON_GAP = 60        // 설명 bottom → 버튼 top (scene 3만)
const BUTTON_H = 130
const BUTTON_W = 660
// ─────────────────────────────────────────────────────────────

interface SceneLayout {
    logoY: number
    titleStartY: number
    descStartY: number
    buttonY: number   // -1 if scene 1 or 2
}

/** 단어 경계 기준 줄바꿈 + 마지막 줄 orphan 방지 */
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

    return lines
}

/**
 * 상단: 로고 + 타이틀 (씬1,2,3 공통 고정)
 * 하단: 이슈 설명 + CTA 버튼 (씬3만 버튼)
 */
function computeLayout(_title: string, desc: string, sceneNumber: number): SceneLayout {
    const descLineCount = Math.max(1, wordWrapLines(desc, 16).length)
    const descHeight = (descLineCount - 1) * DESC_LINE_HEIGHT + DESC_FONTSIZE

    // 로고: 상단 고정
    const logoY = LOGO_TOP_Y

    // 타이틀: 로고 바로 아래 (씬1,2,3 공통)
    const titleStartY = LOGO_TOP_Y + LOGO_H + 60

    // 설명: 하단 고정
    const descStartY = Math.floor(HEIGHT * 0.60)
    const buttonY = sceneNumber === 3 ? descStartY + descHeight + BUTTON_GAP : -1

    return { logoY, titleStartY, descStartY, buttonY }
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
    sceneNumber: number,
    layout: SceneLayout,
    descFinalLines: string[],
    showButton = false,
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

        // CTA 버튼: 씬3, showButton 플래그가 true일 때만 표시
        if (sceneNumber === 3 && layout.buttonY > 0 && showButton) {
            const CTA_SIZE = 58
            const ctaText = '지금 바로 확인하기'
            const ascC = Math.round(font.ascender * CTA_SIZE / font.unitsPerEm)
            const descC = Math.round(Math.abs(font.descender) * CTA_SIZE / font.unitsPerEm)
            const w = font.getAdvanceWidth(ctaText, CTA_SIZE)
            const x = Math.floor((WIDTH - w) / 2)
            const y = layout.buttonY + Math.floor(BUTTON_H / 2) + Math.floor((ascC - descC) / 2)
            addLinePaths(font, svgPaths, ctaText, x, y, CTA_SIZE, '#ffffff', 0, false)
        }
    }

    // 씬3 버튼 rect (showButton 플래그 기준)
    const buttonRectSvg = (sceneNumber === 3 && layout.buttonY > 0 && showButton)
        ? `<rect x="${Math.floor(WIDTH / 2 - BUTTON_W / 2)}" y="${layout.buttonY}" width="${BUTTON_W}" height="${BUTTON_H}" rx="${Math.floor(BUTTON_H / 2)}" fill="#a308e2"/>`
        : ''

    const svg =
        `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
        buttonRectSvg +
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
        const empty = await renderTypingStatePNG(0, sceneNumber, layout, [], false, titleFinalLines, titleWords.length)
        return [{ buffer: empty, duration: sceneDuration }]
    }

    const BUTTON_DELAY = 0.2  // 텍스트 완료 후 버튼 등장까지 딜레이 (초)
    const wordDelay = Math.min(0.4, (sceneDuration * 0.78) / totalWords)
    const frames: { buffer: Buffer; duration: number }[] = []

    for (let n = 1; n <= totalWords; n++) {
        const isLast = n === totalWords
        const showButton = isLast && sceneNumber !== 3  // 씬3는 별도 버튼 프레임에서 처리
        const buffer = await renderTypingStatePNG(
            n, sceneNumber, layout, descFinalLines, showButton, titleFinalLines, titleWords.length
        )
        const duration = isLast && sceneNumber === 3
            ? BUTTON_DELAY  // 씬3 마지막 단어 프레임: 딜레이 시간만 유지
            : isLast
                ? Math.max(sceneDuration - (n - 1) * wordDelay, wordDelay)
                : wordDelay
        frames.push({ buffer, duration })
    }

    // 씬3: 딜레이 후 버튼 등장 프레임 추가
    if (sceneNumber === 3 && totalWords > 0) {
        const buttonBuffer = await renderTypingStatePNG(
            totalWords, sceneNumber, layout, descFinalLines, true, titleFinalLines, titleWords.length
        )
        const remaining = Math.max(sceneDuration - (totalWords - 1) * wordDelay - BUTTON_DELAY, wordDelay)
        frames.push({ buffer: buttonBuffer, duration: remaining })
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
