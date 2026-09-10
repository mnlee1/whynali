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
import { wordWrapLines, DESC_MAX_CHARS_PER_LINE, DESC_SAFE_MAX_LINES } from './text-wrap'

const WIDTH = 720
const HEIGHT = 1280

// ── 배경 소스 크기 (패닝 여유분 20% 포함) ────────────────────────
export const BG_SRC_W = 864   // 720 + 144 (좌72 + 우72)
export const BG_SRC_H = 1536  // 1280 + 256 (상128 + 하128)

// ── 배경 모션 타입 ───────────────────────────────────────────────
export type BgMotionType = 'zoom-in' | 'zoom-out' | 'pan-right' | 'pan-left' | 'pan-up' | 'pan-down' | 'pan-left+zoom-in' | 'pan-right+zoom-in'
export const BG_MOTION_CYCLE: BgMotionType[] = [
    'pan-left+zoom-in', 'pan-right', 'pan-up', 'pan-right+zoom-in', 'pan-left+zoom-in',
]

// ── Easing 함수 ──────────────────────────────────────────────────
function easeLinear(t: number): number {
    return t
}

// ── 레이아웃 단위 (720x1280 기준, 1080x1920 대비 ×0.667) ──────
const LOGO_W = 187
const LOGO_H = 73
const LOGO_TOP_Y = 93
const TITLE_FONTSIZE = 72
const TITLE_LINE_HEIGHT = 90

const DESC_FONTSIZE = 48
const DESC_LINE_HEIGHT = 72
// ─────────────────────────────────────────────────────────────

interface SceneLayout {
    logoY: number
    titleStartY: number
    descStartY: number
}

// 화면 맨 아래(HEIGHT)로부터 확보할 여백 — YouTube Shorts 광고 하단 UI
// (채널명·스폰서 표시·좋아요/댓글/공유 아이콘 열) 회피용. 실측 스크린샷 기준 추정치.
// 값을 줄이면 텍스트가 더 아래(화면 끝에 가깝게), 늘리면 더 위로 이동한다.
const DESC_BOTTOM_MARGIN = 380
const DESC_SAFE_BOTTOM_Y = HEIGHT - DESC_BOTTOM_MARGIN

/**
 * 상단: 로고 + 타이틀 (씬1,2,3 공통 고정)
 * 하단: 이슈 설명 + CTA 버튼 (씬3만 버튼)
 *
 * descStartY는 실제 줄 수 기준으로 역산한다 — 하단 안전선(DESC_SAFE_BOTTOM_Y =
 * HEIGHT - DESC_BOTTOM_MARGIN)에 블록의 "끝"을 고정하고, 줄이 늘어날수록
 * 시작점만 위로 올라가는 구조. 그래야 줄 수가 적을 때 밑에 빈 여백이 남지 않는다.
 * DESC_SAFE_MAX_LINES(5줄)를 넘는 경우에만 안전선 침범을 막기 위해 클램프한다.
 */
function computeLayout(_title: string, desc: string, _sceneNumber?: number): SceneLayout {
    const logoY = LOGO_TOP_Y
    const titleStartY = LOGO_TOP_Y + LOGO_H + 60
    const descLineCount = desc ? wordWrapLines(desc, DESC_MAX_CHARS_PER_LINE).length : 0
    const clampedLines = Math.min(Math.max(descLineCount, 1), DESC_SAFE_MAX_LINES)
    const descStartY = DESC_SAFE_BOTTOM_Y - clampedLines * DESC_LINE_HEIGHT
    return { logoY, titleStartY, descStartY }
}

function escapeDrawtext(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/:/g, '\\:')
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`')
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
 * 하이라이트 단어별 "남은 강조 횟수"를 센다. 같은 단어가 목록에 여러 번 있으면
 * (칩이 여러 개면) 그 문장에서 등장 순서대로 그만큼만 강조하고, 소진되면
 * 이후 등장은 강조하지 않는다 — 칩 개별 삭제/관리가 그대로 강조 개수에 반영되도록.
 */
function buildHighlightBudget(highlights: string[]): Map<string, number> {
    const budget = new Map<string, number>()
    for (const h of highlights) {
        if (!h) continue
        budget.set(h, (budget.get(h) ?? 0) + 1)
    }
    return budget
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTextWithHighlights(
    font: any,
    svgPaths: string[],
    text: string,
    x: number, y: number,
    fontSize: number, defaultColor: string, strokeW: number,
    highlightBudget: Map<string, number>,
): void {
    if (highlightBudget.size === 0) {
        addLinePaths(font, svgPaths, text, x, y, fontSize, defaultColor, strokeW)
        return
    }
    // 부분 문자열 검색 → 여러 단어짜리 강조 키워드도 정확히 매칭
    let remaining = text
    let xPos = x
    while (remaining.length > 0) {
        let matchIdx = -1
        let matchedH = ''
        for (const [h, remainingBudget] of highlightBudget) {
            if (remainingBudget <= 0) continue
            const idx = remaining.indexOf(h)
            if (idx !== -1 && (matchIdx === -1 || idx < matchIdx)) {
                matchIdx = idx
                matchedH = h
            }
        }
        if (matchIdx === -1) {
            addLinePaths(font, svgPaths, remaining, xPos, y, fontSize, defaultColor, strokeW)
            break
        }
        if (matchIdx > 0) {
            const prefix = remaining.slice(0, matchIdx)
            addLinePaths(font, svgPaths, prefix, xPos, y, fontSize, defaultColor, strokeW)
            xPos += font.getAdvanceWidth(prefix, fontSize)
        }
        addLinePaths(font, svgPaths, matchedH, xPos, y, fontSize, '#FFFF4D', strokeW)
        highlightBudget.set(matchedH, (highlightBudget.get(matchedH) ?? 1) - 1)
        xPos += font.getAdvanceWidth(matchedH, fontSize)
        remaining = remaining.slice(matchIdx + matchedH.length)
    }
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
    titleWordCount = 0,
    highlights: string[] = []
): Promise<Buffer> {
    const font = getOTFont()
    const svgPaths: string[] = []

    if (font) {
        const ascT = Math.round(font.ascender * TITLE_FONTSIZE / font.unitsPerEm)
        const ascD = Math.round(font.ascender * DESC_FONTSIZE / font.unitsPerEm)
        const descD = Math.round(Math.abs(font.descender) * DESC_FONTSIZE / font.unitsPerEm)

        // 타이틀 애니메이션 (씬1만, titleFinalLines 전달 시)
        // 타이틀은 하이라이트와 무관 — 강조는 설명(desc/자막)에만 적용
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
        const descHighlightBudget = buildHighlightBudget(highlights)
        const descVisible = Math.max(0, visibleCount - titleWordCount)
        let rendered = 0
        const descRects: string[] = []
        const PAD_X = 10
        const PAD_TOP = 14   // 위 여백
        const PAD_BOT = 6    // 아래 여백
        const LINE_GAP = 6   // 줄 간 간격
        for (let i = 0; i < descFinalLines.length; i++) {
            if (rendered >= descVisible) break
            const lineWords = descFinalLines[i].split(' ').filter(Boolean)
            const visibleInLine = Math.min(lineWords.length, descVisible - rendered)
            const visibleWords = lineWords.slice(0, visibleInLine)
            if (visibleWords.length > 0) {
                const text = visibleWords.join(' ')
                const w = font.getAdvanceWidth(text, DESC_FONTSIZE)
                const x = Math.floor((WIDTH - w) / 2)
                const y = layout.descStartY + i * DESC_LINE_HEIGHT + ascD
                const lineTop = layout.descStartY + i * DESC_LINE_HEIGHT
                descRects.push(
                    `<rect x="${x - PAD_X}" y="${lineTop + LINE_GAP - PAD_TOP}" ` +
                    `width="${w + PAD_X * 2}" height="${ascD + descD + PAD_TOP + PAD_BOT - LINE_GAP}" ` +
                    `fill="black" fill-opacity="0.55"/>`
                )
                drawTextWithHighlights(font, svgPaths, text, x, y, DESC_FONTSIZE, '#E5E7EB', 5, descHighlightBudget)
            }
            rendered += lineWords.length
        }
        // rect는 텍스트 뒤에 깔리도록 앞에 삽입
        svgPaths.unshift(...descRects)
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
    sceneDuration: number,
    highlights: string[] = []
): Promise<{ buffer: Buffer; duration: number }[]> {
    const layout = computeLayout(title, desc, sceneNumber)

    // 씬1: 타이틀+설명 모두 애니메이션 / 씬2,3: 설명만 애니메이션 (타이틀은 정적 레이어)
    const titleFinalLines = sceneNumber === 1 && title ? wordWrapLines(title, DESC_MAX_CHARS_PER_LINE) : []
    const descFinalLines = desc ? wordWrapLines(desc, DESC_MAX_CHARS_PER_LINE) : []

    const titleWords = titleFinalLines.flatMap(l => l.split(' ').filter(Boolean))
    const descWords = descFinalLines.flatMap(l => l.split(' ').filter(Boolean))
    const totalWords = titleWords.length + descWords.length

    if (totalWords === 0) {
        const empty = await renderTypingStatePNG(0, layout, [], titleFinalLines, titleWords.length, highlights)
        return [{ buffer: empty, duration: sceneDuration }]
    }

    const wordDelay = Math.min(0.33, (sceneDuration * 0.85) / totalWords)
    const frames: { buffer: Buffer; duration: number }[] = []

    for (let n = 1; n <= totalWords; n++) {
        const isLast = n === totalWords
        const buffer = await renderTypingStatePNG(n, layout, descFinalLines, titleFinalLines, titleWords.length, highlights)
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

    // BG_SRC_W×BG_SRC_H (864×1536) 로 생성 — 패닝 여유분 포함
    // create3SceneVideo(레거시)는 ffmpeg scale=720:1280 으로 처리하므로 호환됨
    const background = await sharp(bgBuffer)
        .resize(BG_SRC_W, BG_SRC_H, { fit: 'cover', position: 'center' })
        .modulate({ brightness: 0.65 })
        .toBuffer()

    const svg = `<svg width="${BG_SRC_W}" height="${BG_SRC_H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${BG_SRC_W}" height="${BG_SRC_H}" fill="black" opacity="0.2"/>
    </svg>`

    return await sharp(background)
        .composite([{ input: Buffer.from(svg), blend: 'over' }])
        .png()
        .toBuffer()
}

/**
 * 배경 이미지를 프레임 단위로 crop+resize하여 모션 효과 생성.
 * zoompan 필터 대신 Sharp 직접 처리 → easing 곡선 완전 제어.
 *
 * @param bgBuffer - createBackgroundScene() 결과 (BG_SRC_W×BG_SRC_H)
 * @param motionType - 모션 방향/종류
 * @param duration - 씬 길이(초)
 * @param fps - 배경 프레임레이트
 */
export async function createBackgroundFrames(
    bgBuffer: Buffer,
    motionType: BgMotionType,
    duration: number,
    fps: number = 24,
    startT: number = 0,  // 모션 시작 지점 (0.0~1.0)
    endT: number = 1,    // 모션 종료 지점 (0.0~1.0) — 다음 씬과 연속 재생 시 사용
): Promise<{ buffer: Buffer; duration: number }[]> {
    const meta = await sharp(bgBuffer).metadata()
    const srcW = meta.width ?? BG_SRC_W
    const srcH = meta.height ?? BG_SRC_H

    const panX = (srcW - WIDTH) / 2    // 수평 패닝 최대 편이 (각 방향)
    const panY = (srcH - HEIGHT) / 2   // 수직 패닝 최대 편이
    const ZOOM_RANGE = 0.40             // 1.0 → 1.40x

    function getCrop(t: number): { left: number; top: number; width: number; height: number } {
        switch (motionType) {
            case 'zoom-in': {
                const zoom = 1.0 + ZOOM_RANGE * easeLinear(t)
                const w = Math.round(WIDTH / zoom)
                const h = Math.round(HEIGHT / zoom)
                return { left: Math.round((srcW - w) / 2), top: Math.round((srcH - h) / 2), width: w, height: h }
            }
            case 'zoom-out': {
                const zoom = (1.0 + ZOOM_RANGE) - ZOOM_RANGE * easeLinear(t)
                const w = Math.round(WIDTH / zoom)
                const h = Math.round(HEIGHT / zoom)
                return { left: Math.round((srcW - w) / 2), top: Math.round((srcH - h) / 2), width: w, height: h }
            }
            case 'pan-right': {
                return { left: Math.round(panX * 2 * easeLinear(t)), top: Math.round(panY), width: WIDTH, height: HEIGHT }
            }
            case 'pan-left': {
                return { left: Math.round(panX * 2 * (1 - easeLinear(t))), top: Math.round(panY), width: WIDTH, height: HEIGHT }
            }
            case 'pan-up': {
                return { left: Math.round(panX), top: Math.round(panY * 2 * (1 - easeLinear(t))), width: WIDTH, height: HEIGHT }
            }
            case 'pan-down': {
                return { left: Math.round(panX), top: Math.round(panY * 2 * easeLinear(t)), width: WIDTH, height: HEIGHT }
            }
            case 'pan-left+zoom-in': {
                const zoom = 1.0 + ZOOM_RANGE * easeLinear(t)
                const w = Math.round(WIDTH / zoom)
                const h = Math.round(HEIGHT / zoom)
                // 오른쪽→왼쪽 이동하면서 줌인
                const centerX = Math.round(srcW / 2 + panX * (1 - 2 * easeLinear(t)))
                const centerY = Math.round(srcH / 2)
                return {
                    left: Math.max(0, Math.min(centerX - Math.round(w / 2), srcW - w)),
                    top: Math.max(0, Math.min(centerY - Math.round(h / 2), srcH - h)),
                    width: w, height: h,
                }
            }
            case 'pan-right+zoom-in': {
                const zoom = 1.0 + ZOOM_RANGE * easeLinear(t)
                const w = Math.round(WIDTH / zoom)
                const h = Math.round(HEIGHT / zoom)
                // 왼쪽→오른쪽 이동하면서 줌인
                const centerX = Math.round(srcW / 2 + panX * (2 * easeLinear(t) - 1))
                const centerY = Math.round(srcH / 2)
                return {
                    left: Math.max(0, Math.min(centerX - Math.round(w / 2), srcW - w)),
                    top: Math.max(0, Math.min(centerY - Math.round(h / 2), srcH - h)),
                    width: w, height: h,
                }
            }
        }
    }

    const totalFrames = Math.max(1, Math.ceil(duration * fps))
    const frameDuration = 1 / fps
    const frames: { buffer: Buffer; duration: number }[] = []

    for (let i = 0; i < totalFrames; i++) {
        const tLocal = totalFrames > 1 ? i / (totalFrames - 1) : 0
        const t = startT + (endT - startT) * tLocal  // [startT, endT] 구간으로 매핑
        const crop = getCrop(t)

        // 경계 초과 방지
        const safeLeft = Math.max(0, Math.min(crop.left, srcW - crop.width))
        const safeTop = Math.max(0, Math.min(crop.top, srcH - crop.height))

        const frameBuffer = await sharp(bgBuffer)
            .extract({ left: safeLeft, top: safeTop, width: crop.width, height: crop.height })
            .resize(WIDTH, HEIGHT, { fit: 'fill' })
            .png()
            .toBuffer()

        const remaining = duration - i * frameDuration
        frames.push({
            buffer: frameBuffer,
            duration: i === totalFrames - 1 ? Math.max(remaining, frameDuration) : frameDuration,
        })
    }

    return frames
}

/**
 * Scene 구조 레이어 생성 (투명 배경).
 * 로고 + CTA 버튼 rect (scene 3만) — 위치는 computeLayout 기준.
 *
 * @param sceneNumber - 씬 번호
 * @param title - 타이틀 (레이아웃 계산용)
 * @param desc - 설명 (레이아웃 계산용)
 * @param highlights - 타이틀 내 노란색(#FFFF4D)으로 강조할 키워드 목록 (desc 하이라이트와 동일 색상)
 */
export async function createSceneTextOverlay(
    sceneNumber: number,
    title: string = '',
    desc: string = '',
    highlights: string[] = []
): Promise<Buffer> {
    const layout = computeLayout(title, desc, sceneNumber)
    const logoBase64 = getLogoBase64()
    const logoX = Math.floor(WIDTH / 2 - LOGO_W / 2)
    const font = getOTFont()
    const svgPaths: string[] = []

    // 타이틀 정적 렌더링 (씬2,3만 — 씬1은 타이핑 애니메이션으로 처리)
    if (font && title && sceneNumber !== 1) {
        const titleLines = wordWrapLines(title, DESC_MAX_CHARS_PER_LINE)
        const ascT = Math.round(font.ascender * TITLE_FONTSIZE / font.unitsPerEm)
        const titleHighlightBudget = buildHighlightBudget(highlights)
        for (let i = 0; i < titleLines.length; i++) {
            const line = titleLines[i]
            if (!line.trim()) continue
            const w = font.getAdvanceWidth(line, TITLE_FONTSIZE)
            const x = Math.floor((WIDTH - w) / 2)
            const y = layout.titleStartY + i * TITLE_LINE_HEIGHT + ascT
            drawTextWithHighlights(font, svgPaths, line, x, y, TITLE_FONTSIZE, '#ffffff', 8, titleHighlightBudget)
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
const SEARCH_SUBTITLE_Y2 = SEARCH_SUBTITLE_Y1 + 50
const SEARCH_SUBTITLE_Y3 = SEARCH_SUBTITLE_Y2 + 50
const SEARCH_QUERY = 'whynali.com'
const SEARCH_SUBTITLE_LINE1 = "지금 주소창에"
const SEARCH_SUBTITLE_LINE2 = "왜난리,"
const SEARCH_SUBTITLE_LINE3 = "whynali.com를 검색하세요"
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
    const sub3Words = SEARCH_SUBTITLE_LINE3.split(' ')
    const BASE_CHAR_DELAY = 0.10
    const BASE_WORD_DELAY = 0.17
    const TEXT_START_DELAY = 0.20
    const MIN_HOLD = 0.5

    // 씬 길이(나레이션 오디오 기준)가 원래 속도로 다 보여주기엔 부족할 경우,
    // 타이핑/단어 등장 속도를 비례 축소해 마지막 줄까지 항상 화면에 나오도록 보정
    const totalWordCount = sub1Words.length + sub2Words.length + sub3Words.length
    const baseAnimTime = searchChars.length * BASE_CHAR_DELAY + totalWordCount * BASE_WORD_DELAY
    const availableForAnim = Math.max(sceneDuration - TEXT_START_DELAY - MIN_HOLD, 0.1)
    const speedScale = baseAnimTime > availableForAnim ? availableForAnim / baseAnimTime : 1
    const CHAR_DELAY = BASE_CHAR_DELAY * speedScale
    const WORD_DELAY = BASE_WORD_DELAY * speedScale

    const totalAnimTime = searchChars.length * CHAR_DELAY + totalWordCount * WORD_DELAY
    const holdTime = Math.max(sceneDuration - TEXT_START_DELAY - totalAnimTime, MIN_HOLD)

    const magCY = SEARCH_BAR_Y + Math.floor(SEARCH_BAR_H / 2)

    async function renderFrame(visibleChars: number, visibleSub1: number, visibleSub2: number, visibleSub3: number): Promise<Buffer> {
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

            if (visibleSub3 > 0) {
                const subText3 = sub3Words.slice(0, visibleSub3).join(' ')
                const w3 = font.getAdvanceWidth(subText3, SEARCH_SUBTITLE_FONTSIZE)
                const x3 = Math.floor((WIDTH - w3) / 2)
                addLinePaths(font, svgPaths, subText3, x3, SEARCH_SUBTITLE_Y3 + ascSub, SEARCH_SUBTITLE_FONTSIZE, '#E5E7EB', 5)
            }
        }

        const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${svgPaths.join('')}${svgElements.join('')}</svg>`
        return sharp(Buffer.from(svg)).png().toBuffer()
    }

    const frames: { buffer: Buffer; duration: number }[] = []
    frames.push({ buffer: await renderFrame(0, 0, 0, 0), duration: TEXT_START_DELAY })
    for (let i = 1; i <= searchChars.length; i++) {
        frames.push({ buffer: await renderFrame(i, 0, 0, 0), duration: CHAR_DELAY })
    }
    for (let i = 1; i <= sub1Words.length; i++) {
        frames.push({ buffer: await renderFrame(searchChars.length, i, 0, 0), duration: WORD_DELAY })
    }
    for (let i = 1; i <= sub2Words.length; i++) {
        frames.push({ buffer: await renderFrame(searchChars.length, sub1Words.length, i, 0), duration: WORD_DELAY })
    }
    for (let i = 1; i <= sub3Words.length; i++) {
        const isLast = i === sub3Words.length
        frames.push({ buffer: await renderFrame(searchChars.length, sub1Words.length, sub2Words.length, i), duration: isLast ? holdTime : WORD_DELAY })
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
