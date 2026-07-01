/**
 * scripts/sample-hook.ts
 *
 * 3초 훅 구조 샘플 영상 비교
 * 실행: npx tsx scripts/sample-hook.ts
 *
 * 출력:
 *   output/sample-current.mp4    — 현재 상태
 *   output/sample-with-hook.mp4  — Scene0 + 고정 타이틀 + 핵심어 컬러 하이라이트
 */

import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })

import Groq from 'groq-sdk'
import { writeFile, mkdir, rm } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import { exec as execCallback } from 'child_process'
import { promisify } from 'util'
import sharp from 'sharp'
import {
    createBackgroundScene,
    createBackgroundFrames,
    createSceneTextOverlay,
    createTypingFrames,
    createSearchSceneOverlay,
    createSearchTypingFrames,
    type BgMotionType,
} from '../lib/shortform/generate-scenes'
import { generateNSceneAudios } from '../lib/shortform/generate-voice'

const exec = promisify(execCallback)

// ── 레이아웃 상수 (generate-scenes.ts 동일) ──────────────────────
const WIDTH  = 720
const HEIGHT = 1280
const LOGO_W = 187, LOGO_H = 73, LOGO_TOP_Y = 93
const TITLE_FONTSIZE    = 72
const TITLE_LINE_HEIGHT = 90
const DESC_FONTSIZE     = 48
const DESC_LINE_HEIGHT  = 72
const DESC_MAX_CHARS    = 13
const DESC_PAD_X = 10, DESC_PAD_TOP = 14, DESC_PAD_BOT = 6
const TITLE_START_Y     = LOGO_TOP_Y + LOGO_H + 60

// ── 테스트 데이터 ────────────────────────────────────────────────
// 현재: 타이핑 애니메이션 타이틀
const SCENE_DATA_CURRENT = [
    { title: '마이크론 실적 발표',    desc: '역대 최고 실적을 기록했다' },
    { title: '시장 반응은?',          desc: '반도체주 전반에 훈풍이 불었다' },
    { title: '앞으로는?',             desc: '국내 관련주 상승 여부에 관심 집중' },
]

// 훅 버전: 고정 타이틀 (씬 1 타이틀로 전체 통일) + 핵심어 컬러 하이라이트
interface SceneConfig { title: string; desc: string; highlights: string[] }
const SCENE_DATA_HOOK: SceneConfig[] = [
    { title: '반도체 역사가 바뀐 날', desc: '역대 최고 실적을 기록했다',         highlights: ['역대 최고'] },
    { title: '반도체 역사가 바뀐 날', desc: '반도체주 전반에 훈풍이 불었다',      highlights: ['훈풍'] },
    { title: '반도체 역사가 바뀐 날', desc: '국내 관련주 상승 여부에 관심 집중',  highlights: ['상승'] },
]

const SAMPLE_IMAGES = [
    'https://images.pexels.com/photos/6694543/pexels-photo-6694543.jpeg?w=1280',
    'https://images.pexels.com/photos/5668481/pexels-photo-5668481.jpeg?w=1280',
    'https://images.pexels.com/photos/6929210/pexels-photo-6929210.jpeg?w=1280',
    'https://images.pexels.com/photos/6929210/pexels-photo-6929210.jpeg?w=1280',
]

const MOTIONS: BgMotionType[] = [
    'pan-left+zoom-in',
    'pan-right',
    'pan-up',
    'pan-left+zoom-in',
]

const SCENE_DURATION  = 3.0
const FPS = 15

// ── Pretendard 폰트 로더 ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const opentype = require('opentype.js') as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _font: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadFont(): any {
    if (_font) return _font
    try { _font = opentype.loadSync(join(process.cwd(), 'public', 'fonts', 'Pretendard-Bold.ttf')) }
    catch { _font = null }
    return _font
}

function getLogoBase64(): string {
    try { return `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'whynali-logo.png')).toString('base64')}` }
    catch { return '' }
}

// ── Groq 핵심어 추출 ─────────────────────────────────────────────
async function generateHighlights(desc: string): Promise<string[]> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey || !desc.trim()) return []
    try {
        const groq = new Groq({ apiKey })
        const res = await groq.chat.completions.create({
            model: 'qwen/qwen3.6-27b',
            messages: [{
                role: 'user',
                content: `숏폼 설명 텍스트에서 강조할 핵심 단어 1~2개를 추출하세요.\n규칙: 문장 내 실제 등장하는 단어만, 명사 위주, 숫자+단위 조합 가능\nJSON만 반환: {"highlights":["단어1"]}\n\n텍스트: "${desc}"`
            }],
            temperature: 0,
            max_tokens: 4096,
        })
        const raw  = res.choices[0]?.message?.content?.trim() ?? ''
        const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        const json = text.match(/\{[\s\S]*\}/)?.[0] ?? '{}'
        const parsed = JSON.parse(json)
        return Array.isArray(parsed.highlights)
            ? parsed.highlights.filter((h: unknown) => typeof h === 'string')
            : []
    } catch (e) {
        console.error('[generateHighlights 오류]', e)
        return []
    }
}

// ── FFmpeg 경로 ──────────────────────────────────────────────────
function getFfmpegPath(): string {
    const path = require('path') as typeof import('path')
    const fs   = require('fs')   as typeof import('fs')
    const directPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if (fs.existsSync(directPath)) return directPath
    try {
        const ffmpegStatic = require('ffmpeg-static')
        if (typeof ffmpegStatic === 'string') return ffmpegStatic
    } catch {}
    throw new Error('ffmpeg-static을 찾을 수 없습니다')
}

// ── 단어 줄바꿈 ─────────────────────────────────────────────────
function wrapWords(text: string, maxChars: number): string[] {
    const words = text.split(' ').filter(Boolean)
    const lines: string[] = []
    let current = ''
    for (const word of words) {
        const test = current ? `${current} ${word}` : word
        if (test.length <= maxChars) { current = test }
        else { if (current) lines.push(current); current = word }
    }
    if (current) lines.push(current)
    const result = lines.length > 0 ? lines : ['']

    // 마지막 줄 단어 1개(orphan)면 앞 줄 마지막 단어를 당겨옴
    if (result.length >= 2) {
        const lastWords = result[result.length - 1].split(' ').filter(Boolean)
        const prevWords = result[result.length - 2].split(' ').filter(Boolean)
        if (lastWords.length === 1 && prevWords.length >= 2) {
            const pulled = prevWords[prevWords.length - 1]
            result[result.length - 2] = prevWords.slice(0, -1).join(' ')
            result[result.length - 1] = `${pulled} ${lastWords[0]}`
        }
    }

    return result
}

// ── 고정 타이틀 오버레이 (72px 커스텀 렌더링) ────────────────────
async function createFixedTitleOverlay(title: string): Promise<Buffer> {
    const font       = loadFont()
    const logoBase64 = getLogoBase64()
    const lines      = wrapWords(title, 10)
    const svgPaths: string[] = []

    if (font) {
        const ascT = Math.round(font.ascender * TITLE_FONTSIZE / font.unitsPerEm)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]; if (!line.trim()) continue
            const w = font.getAdvanceWidth(line, TITLE_FONTSIZE)
            const x = Math.floor((WIDTH - w) / 2)
            const y = TITLE_START_Y + i * TITLE_LINE_HEIGHT + ascT
            const sp = font.getPath(line, x, y, TITLE_FONTSIZE)
            sp.fill = 'none'; sp.stroke = '#000000'; sp.strokeWidth = 9; svgPaths.push(sp.toSVG(2))
            const fp = font.getPath(line, x, y, TITLE_FONTSIZE)
            fp.fill = '#ffffff'; fp.stroke = null; svgPaths.push(fp.toSVG(2))
        }
    }

    const logoX = Math.floor(WIDTH / 2 - LOGO_W / 2)
    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        ${logoBase64 ? `<image href="${logoBase64}" x="${logoX}" y="${LOGO_TOP_Y}" width="${LOGO_W}" height="${LOGO_H}"/>` : ''}
        ${svgPaths.join('')}
    </svg>`

    return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: Buffer.from(svg), blend: 'over' }]).png().toBuffer()
}

// ── 설명 타이핑 프레임 with 핵심어 컬러 하이라이트 ───────────────
async function createDescFramesHighlight(
    desc: string,
    highlights: string[],
    duration: number,
): Promise<{ buffer: Buffer; duration: number }[]> {
    const font  = loadFont()
    const words = desc.split(' ').filter(Boolean)
    const lines = wrapWords(desc, DESC_MAX_CHARS)

    if (!font || words.length === 0) {
        const empty = await renderDescFrame(font, 0, words, lines, highlights)
        return [{ buffer: empty, duration }]
    }

    const wordDelay = Math.min(0.33, (duration * 0.85) / words.length)

    const frames: { buffer: Buffer; duration: number }[] = []

    for (let n = 1; n <= words.length; n++) {
        const d = n < words.length
            ? wordDelay
            : Math.max(duration - (n - 1) * wordDelay, wordDelay)
        frames.push({ buffer: await renderDescFrame(font, n, words, lines, highlights), duration: d })
    }

    return frames

    async function renderDescFrame(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        f: any, visibleCount: number, _allWords: string[], allLines: string[], hl: string[]
    ): Promise<Buffer> {
        const svgBgRects: string[] = []
        const svgPaths: string[]   = []
        let wordIdx = 0

        for (let li = 0; li < allLines.length; li++) {
            const lineWords = allLines[li].split(' ').filter(Boolean)
            const visibleInLine: { word: string; isHL: boolean }[] = []

            for (const w of lineWords) {
                if (wordIdx >= visibleCount) break
                const isHL = hl.some(h => w.includes(h) || h.includes(w))
                visibleInLine.push({ word: w, isHL })
                wordIdx++
            }
            if (visibleInLine.length === 0) { wordIdx += lineWords.length; continue }

            const lineText = visibleInLine.map(v => v.word).join(' ')
            const lineW    = f ? f.getAdvanceWidth(lineText, DESC_FONTSIZE) : lineText.length * 26
            const lineX    = Math.floor((WIDTH - lineW) / 2)
            const baseY    = Math.floor(HEIGHT * 0.60) + li * DESC_LINE_HEIGHT
            const ascVal   = f ? Math.round(f.ascender * DESC_FONTSIZE / f.unitsPerEm) : 32
            const descVal  = f ? Math.round(Math.abs(f.descender) * DESC_FONTSIZE / f.unitsPerEm) : 10

            // 배경 박스 (원본 generate-scenes.ts 동일 공식)
            const LINE_GAP = 6
            const boxX = lineX - DESC_PAD_X
            const boxY = baseY + LINE_GAP - DESC_PAD_TOP
            const boxW = lineW + DESC_PAD_X * 2
            const boxH = ascVal + descVal + DESC_PAD_TOP + DESC_PAD_BOT - LINE_GAP
            svgBgRects.push(`<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" fill="black" fill-opacity="0.55"/>`)

            // 단어별 렌더링
            let xPos = lineX
            for (const { word, isHL } of visibleInLine) {
                const fillColor   = isHL ? '#FFFF4D' : '#E5E7EB'
                const strokeColor = '#000000'
                if (f) {
                    const sp = f.getPath(word, xPos, baseY + ascVal, DESC_FONTSIZE)
                    sp.fill = 'none'; sp.stroke = strokeColor; sp.strokeWidth = 5; svgPaths.push(sp.toSVG(2))
                    const fp = f.getPath(word, xPos, baseY + ascVal, DESC_FONTSIZE)
                    fp.fill = fillColor; fp.stroke = null; svgPaths.push(fp.toSVG(2))
                    xPos += f.getAdvanceWidth(`${word} `, DESC_FONTSIZE)
                }
            }
        }

        const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            ${svgBgRects.join('')}
            ${svgPaths.join('')}
        </svg>`
        return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: Buffer.from(svg), blend: 'over' }]).png().toBuffer()
    }
}

// ── 프레임 → MP4 ─────────────────────────────────────────────────
async function buildBgVideo(frames: { buffer: Buffer; duration: number }[], outputPath: string, ffmpegPath: string, fps: number): Promise<void> {
    const tmpDir = outputPath + '_ftmp'
    await mkdir(tmpDir, { recursive: true })
    try {
        await Promise.all(frames.map((f, i) => writeFile(join(tmpDir, `f-${String(i).padStart(5, '0')}.png`), f.buffer)))
        const listPath = join(tmpDir, 'list.txt')
        await writeFile(listPath, frames.map((f, i) =>
            `file '${join(tmpDir, `f-${String(i).padStart(5, '0')}.png`).replace(/\\/g, '/')}'\nduration ${f.duration.toFixed(4)}`
        ).join('\n'))
        await exec(`"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" -vf "fps=${fps}" -c:v libx264 -pix_fmt yuv420p -crf 23 "${outputPath}"`)
    } finally { await rm(tmpDir, { recursive: true, force: true }) }
}

// ── 프레임 → MKV (알파 보존) ─────────────────────────────────────
async function buildTextVideo(frames: { buffer: Buffer; duration: number }[], outputPath: string, ffmpegPath: string, fps: number, duration: number): Promise<void> {
    const tmpDir = outputPath + '_ftmp'
    await mkdir(tmpDir, { recursive: true })
    try {
        await Promise.all(frames.map((f, i) => writeFile(join(tmpDir, `f-${String(i).padStart(5, '0')}.png`), f.buffer)))
        const lines: string[] = []
        for (let i = 0; i < frames.length; i++) {
            lines.push(`file '${join(tmpDir, `f-${String(i).padStart(5, '0')}.png`).replace(/\\/g, '/')}'`)
            lines.push(`duration ${frames[i].duration.toFixed(4)}`)
        }
        lines.push(`file '${join(tmpDir, `f-${String(frames.length - 1).padStart(5, '0')}.png`).replace(/\\/g, '/')}'`)
        await writeFile(join(tmpDir, 'list.txt'), lines.join('\n'))
        await exec(`"${ffmpegPath}" -y -f concat -safe 0 -i "${join(tmpDir, 'list.txt')}" -vf "fps=${fps}" -pix_fmt rgba -c:v png -t ${duration.toFixed(4)} "${outputPath}"`)
    } finally { await rm(tmpDir, { recursive: true, force: true }) }
}

// ── FFmpeg 3-레이어 합성 ─────────────────────────────────────────
async function composite3Layer(bgPath: string, overlayPath: string, textMkvPath: string, duration: number, outPath: string, ffmpegPath: string): Promise<void> {
    const filter =
        `[1:v]format=rgba,colorchannelmixer=aa=1[struct];` +
        `[0:v][struct]overlay=0:0[bgs];` +
        `[2:v]format=rgba[textanim];` +
        `[bgs][textanim]overlay=0:0[vout]`
    await exec(
        `"${ffmpegPath}" -i "${bgPath}" -loop 1 -i "${overlayPath}" -i "${textMkvPath}" ` +
        `-filter_complex "${filter}" -map "[vout]" -c:v libx264 -pix_fmt yuv420p -crf 23 -t ${duration.toFixed(4)} -y "${outPath}"`
    )
}

// ── 일반 씬: 현재 방식 (타이틀 타이핑 애니메이션) ────────────────
async function buildSceneCurrent(bgBuf: Buffer, motionType: BgMotionType, sceneNum: number, title: string, desc: string, isSearch: boolean, duration: number, tmpDir: string, idx: number, ffmpegPath: string, startT: number, endT: number): Promise<string> {
    const bgPath      = join(tmpDir, `bg-${idx}.mp4`)
    const overlayPath = join(tmpDir, `overlay-${idx}.png`)
    const textMkvPath = join(tmpDir, `text-${idx}.mkv`)
    const outPath     = join(tmpDir, `scene-${idx}.mp4`)

    await buildBgVideo(await createBackgroundFrames(bgBuf, motionType, duration, FPS, startT, endT), bgPath, ffmpegPath, FPS)
    await writeFile(overlayPath, isSearch ? await createSearchSceneOverlay() : await createSceneTextOverlay(sceneNum, title, desc))
    const textFrames = isSearch ? await createSearchTypingFrames(duration) : await createTypingFrames(title, desc, sceneNum, duration)
    await buildTextVideo(textFrames, textMkvPath, ffmpegPath, FPS, duration)
    await composite3Layer(bgPath, overlayPath, textMkvPath, duration, outPath, ffmpegPath)
    return outPath
}

// ── 훅 씬: 고정 타이틀 + 설명 하이라이트 애니메이션 ─────────────
async function buildSceneHook(bgBuf: Buffer, motionType: BgMotionType, _sceneNum: number, title: string, desc: string, highlights: string[], isSearch: boolean, duration: number, tmpDir: string, idx: number, ffmpegPath: string, startT: number, endT: number): Promise<string> {
    const bgPath      = join(tmpDir, `bg-${idx}.mp4`)
    const overlayPath = join(tmpDir, `overlay-${idx}.png`)
    const textMkvPath = join(tmpDir, `text-${idx}.mkv`)
    const outPath     = join(tmpDir, `scene-${idx}.mp4`)

    await buildBgVideo(await createBackgroundFrames(bgBuf, motionType, duration, FPS, startT, endT), bgPath, ffmpegPath, FPS)

    if (isSearch) {
        await writeFile(overlayPath, await createSearchSceneOverlay())
        await buildTextVideo(await createSearchTypingFrames(duration), textMkvPath, ffmpegPath, FPS, duration)
    } else {
        // 타이틀 고정 오버레이 (애니메이션 없음)
        await writeFile(overlayPath, await createFixedTitleOverlay(title))
        // 설명만 애니메이션 + 핵심어 컬러 하이라이트
        await buildTextVideo(await createDescFramesHighlight(desc, highlights, duration), textMkvPath, ffmpegPath, FPS, duration)
    }

    await composite3Layer(bgPath, overlayPath, textMkvPath, duration, outPath, ffmpegPath)
    return outPath
}

// ── TTS 오디오 병합 ───────────────────────────────────────────────
async function buildMergedAudio(
    audioBuffers: (Buffer | null)[],
    sceneDuration: number,
    outputPath: string,
    ffmpegPath: string,
    tmpDir: string
): Promise<void> {
    const audioPaths: string[] = []
    for (let i = 0; i < audioBuffers.length; i++) {
        const buf     = audioBuffers[i]
        const padPath = join(tmpDir, `tts-pad-${i}.aac`)
        if (buf) {
            const rawPath = join(tmpDir, `tts-raw-${i}.mp3`)
            await writeFile(rawPath, buf)
            await exec(`"${ffmpegPath}" -i "${rawPath}" -af "apad" -t ${sceneDuration.toFixed(4)} -c:a aac -y "${padPath}"`)
        } else {
            await exec(`"${ffmpegPath}" -f lavfi -i "anullsrc=r=44100:cl=stereo" -t ${sceneDuration.toFixed(4)} -c:a aac -y "${padPath}"`)
        }
        audioPaths.push(padPath)
    }
    const listPath = join(tmpDir, 'audio-list.txt')
    await writeFile(listPath, audioPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'))
    await exec(`"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" -c:a aac -y "${outputPath}"`)
}

// ── 씬들 → 합본 ──────────────────────────────────────────────────
async function concatScenes(scenePaths: string[], outputPath: string, ffmpegPath: string, tmpDir: string): Promise<void> {
    const listPath = join(tmpDir, 'concat.txt')
    await writeFile(listPath, scenePaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'))
    await exec(`"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -pix_fmt yuv420p -crf 23 "${outputPath}"`)
}

// ── 현재 버전 영상 생성 ───────────────────────────────────────────
async function buildCurrentVideo(outputPath: string, ffmpegPath: string): Promise<void> {
    const tmpDir = outputPath + '_tmp'
    await mkdir(tmpDir, { recursive: true })
    const scenePaths: string[] = []
    let prevBgBuf: Buffer | null = null
    let idx = 0
    const splitT = 0.5

    for (let i = 0; i < MOTIONS.length; i++) {
        const isSearch   = i === MOTIONS.length - 1
        const motionType = isSearch ? MOTIONS[MOTIONS.length - 2] : MOTIONS[i]
        const startT     = isSearch ? splitT : 0
        const endT       = i === MOTIONS.length - 2 ? splitT : 1
        const scene      = SCENE_DATA_CURRENT[i % SCENE_DATA_CURRENT.length]

        process.stdout.write(`  [현재] 씬${isSearch ? '(검색바)' : i + 1} 생성... `)
        const t0 = Date.now()
        const bgBuf = isSearch && prevBgBuf ? prevBgBuf : await createBackgroundScene(SAMPLE_IMAGES[i % SAMPLE_IMAGES.length])
        scenePaths.push(await buildSceneCurrent(bgBuf, motionType, i + 1, scene.title, scene.desc, isSearch, SCENE_DURATION, tmpDir, idx++, ffmpegPath, startT, endT))
        if (!isSearch) prevBgBuf = bgBuf
        console.log(`완료 (${Date.now() - t0}ms)`)
    }

    process.stdout.write(`  [현재] 합본 인코딩... `)
    const t1 = Date.now()
    await concatScenes(scenePaths, outputPath, ffmpegPath, tmpDir)
    console.log(`완료 (${Date.now() - t1}ms) → ${outputPath}`)
    await rm(tmpDir, { recursive: true, force: true })
}

// ── 훅 버전 영상 생성 ─────────────────────────────────────────────
async function buildHookVideo(outputPath: string, ffmpegPath: string): Promise<void> {
    const tmpDir = outputPath + '_tmp'
    await mkdir(tmpDir, { recursive: true })
    const scenePaths: string[] = []
    let prevBgBuf: Buffer | null = null
    let idx = 0
    const splitT = 0.5

    // AI 핵심어 추출 (씬별 desc → highlights)
    process.stdout.write('  [훅] 핵심어 추출... ')
    const tHL = Date.now()
    const aiHighlights: string[][] = []
    for (const s of SCENE_DATA_HOOK) {
        aiHighlights.push(await generateHighlights(s.desc))
    }
    console.log(`완료 (${Date.now() - tHL}ms) → ${aiHighlights.map((h, i) => `씬${i + 1}:[${h.join(',')}]`).join(' ')}`)

    for (let i = 0; i < MOTIONS.length; i++) {
        const isSearch   = i === MOTIONS.length - 1
        const motionType = isSearch ? MOTIONS[MOTIONS.length - 2] : MOTIONS[i]
        const startT     = isSearch ? splitT : 0
        const endT       = i === MOTIONS.length - 2 ? splitT : 1
        const scene      = SCENE_DATA_HOOK[i % SCENE_DATA_HOOK.length]
        const highlights = isSearch ? [] : aiHighlights[i % SCENE_DATA_HOOK.length]

        process.stdout.write(`  [훅] 씬${isSearch ? '(검색바)' : i + 1} 생성... `)
        const t0 = Date.now()
        const bgBuf = isSearch && prevBgBuf ? prevBgBuf : await createBackgroundScene(SAMPLE_IMAGES[i % SAMPLE_IMAGES.length])
        scenePaths.push(await buildSceneHook(bgBuf, motionType, i + 1, scene.title, scene.desc, highlights, isSearch, SCENE_DURATION, tmpDir, idx++, ffmpegPath, startT, endT))
        if (!isSearch) prevBgBuf = bgBuf
        console.log(`완료 (${Date.now() - t0}ms)`)
    }

    process.stdout.write(`  [훅] 합본 인코딩... `)
    const t1 = Date.now()
    const videoOnlyPath = join(tmpDir, 'video-only.mp4')
    await concatScenes(scenePaths, videoOnlyPath, ffmpegPath, tmpDir)
    console.log(`완료 (${Date.now() - t1}ms)`)

    process.stdout.write(`  [훅] TTS 생성... `)
    const t2 = Date.now()
    const descTexts: string[] = [...SCENE_DATA_HOOK.map(s => s.desc), '']
    const audioBuffers = await generateNSceneAudios(descTexts)
    const mergedAudioPath = join(tmpDir, 'audio-merged.aac')
    await buildMergedAudio(audioBuffers, SCENE_DURATION, mergedAudioPath, ffmpegPath, tmpDir)
    console.log(`완료 (${Date.now() - t2}ms)`)

    process.stdout.write(`  [훅] 오디오 합성... `)
    const t3 = Date.now()
    await exec(`"${ffmpegPath}" -i "${videoOnlyPath}" -i "${mergedAudioPath}" -c:v copy -c:a aac -shortest -y "${outputPath}"`)
    console.log(`완료 (${Date.now() - t3}ms) → ${outputPath}`)
    await rm(tmpDir, { recursive: true, force: true })
}

// ── 실행 ─────────────────────────────────────────────────────────
async function main() {
    const outputDir  = join(process.cwd(), 'output')
    const ffmpegPath = getFfmpegPath()
    await mkdir(outputDir, { recursive: true })
    loadFont()

    console.log('\n3초 훅 샘플 영상 생성 시작\n')
    await buildCurrentVideo(join(outputDir, 'sample-current.mp4'), ffmpegPath)
    await buildHookVideo(join(outputDir, 'sample-with-hook.mp4'), ffmpegPath)

    console.log('\n완료.')
    console.log('  output/sample-current.mp4   — 현재 상태 (타이틀 타이핑 애니메이션)')
    console.log('  output/sample-with-hook.mp4 — Scene0 + 고정 타이틀 + 핵심어 컬러 하이라이트')
}

main().catch(err => { console.error('오류:', err); process.exit(1) })
