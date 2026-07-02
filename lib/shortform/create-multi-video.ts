/**
 * lib/shortform/create-multi-video.ts
 *
 * 3개 Scene 이미지를 하나의 동영상으로 합성
 *
 * sceneAudios 제공 시: 씬별 TTS 싱크 모드 (텍스트 나타날 때 목소리도 함께)
 * audioBuffer 제공 시: 단일 오디오 합성 (레거시)
 */

import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import { writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
    getTypingDrawtextFilters,
    createTypingFrames,
    createSearchTypingFrames,
    createBackgroundFrames,
    BG_MOTION_CYCLE,
    type BgMotionType,
} from './generate-scenes'
import type { SceneAudios } from './generate-voice'

/** 씬별 텍스트 콘텐츠 (FFmpeg drawtext 렌더링용) */
export interface SceneContent {
    title: string
    desc: string
    isSearchScene?: boolean
    highlights?: string[]
}

const exec = promisify(execCallback)

/**
 * Sharp 타이핑 프레임 배열을 RGBA 영상(MKV/PNG코덱)으로 변환.
 */
async function buildTextAnimationVideo(
    frames: { buffer: Buffer; duration: number }[],
    tmpDir: string,
    sceneIndex: number,
    ffmpegPath: string,
    sceneDuration: number,
    fps: number
): Promise<string> {
    const framePaths: string[] = []

    for (let i = 0; i < frames.length; i++) {
        const framePath = join(tmpDir, `tf_s${sceneIndex}_f${i}.png`)
        await writeFile(framePath, frames[i].buffer)
        framePaths.push(framePath)
    }

    const lines = ['ffconcat version 1.0']
    for (let i = 0; i < frames.length; i++) {
        lines.push(`file '${framePaths[i].replace(/\\/g, '/')}'`)
        lines.push(`duration ${frames[i].duration.toFixed(4)}`)
    }
    lines.push(`file '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'`)

    const concatPath = join(tmpDir, `textconcat_s${sceneIndex}.txt`)
    await writeFile(concatPath, lines.join('\n'))

    const outputPath = join(tmpDir, `textanim_s${sceneIndex}.mkv`)
    await exec(
        `"${ffmpegPath}" -f concat -safe 0 -i "${concatPath}" ` +
        `-vf fps=${fps} -pix_fmt rgba -c:v png -t ${sceneDuration.toFixed(4)} -y "${outputPath}"`
    )

    const { rm } = await import('fs/promises')
    await Promise.all([
        ...framePaths.map(p => rm(p, { force: true }).catch(() => {})),
        rm(concatPath, { force: true }).catch(() => {}),
    ])

    return outputPath
}

/**
 * Ken Burns 효과 (zoompan) 필터 문자열 반환.
 * opts.startZoom: 1.0 초과 시 연속 줌 (이전 씬에서 이어받은 시작 값)
 * opts.step: 프레임당 줌 증가량 (그룹 공유)
 * opts.centerX: true면 항상 중앙 고정 (연속 줌 그룹용)
 */
function getKenBurnsFilter(
    sceneIndex: number,
    frames: number,
    fps: number,
    opts?: { startZoom?: number; step?: number; centerX?: boolean; groupOffset?: number; groupTotal?: number }
): string {
    const groupTotal = opts?.groupTotal
    const groupOffset = opts?.groupOffset ?? 0
    const isContinuous = (opts?.startZoom ?? 1.0) > 1.001

    // 그룹 선형: 같은 배경을 공유하는 씬 묶음 전체 프레임 기준으로 일정한 속도 계산
    // → 씬이 바뀌어도 zoom이 끊기지 않고 이어짐
    // 독립 씬: 해당 씬 프레임 기준 선형 (1.0 → 1.15)
    const zExpr = (groupTotal !== undefined && groupTotal > 0)
        ? `min(1.0+0.4*(${groupOffset}+on)/${groupTotal},1.4)`
        : `min(1.0+0.4*on/${frames},1.4)`

    const yExpr = `ih/2-(ih/zoom/2)`

    let xExpr: string
    if (opts?.centerX || isContinuous || (groupTotal !== undefined && groupTotal > 0)) {
        xExpr = `iw/2-(iw/zoom/2)`
    } else if (sceneIndex === 0) {
        xExpr = `on*0.4`
    } else if (sceneIndex === 1) {
        xExpr = `max(44-on*0.4,0)`
    } else {
        xExpr = `iw/2-(iw/zoom/2)`
    }

    return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:fps=${fps}:s=720x1280,setpts=PTS-STARTPTS`
}

const BG_FPS = 15

/**
 * 배경 모션 프레임 배열을 yuv420p MP4로 인코딩.
 * Sharp가 생성한 PNG 시퀀스 → ffconcat → libx264(ultrafast)
 */
async function buildBackgroundMotionVideo(
    frames: { buffer: Buffer; duration: number }[],
    tmpDir: string,
    sceneIndex: number,
    ffmpegPath: string,
    sceneDuration: number
): Promise<string> {
    const framePaths: string[] = []
    for (let i = 0; i < frames.length; i++) {
        const framePath = join(tmpDir, `bg_s${sceneIndex}_f${i}.png`)
        await writeFile(framePath, frames[i].buffer)
        framePaths.push(framePath)
    }

    const lines = ['ffconcat version 1.0']
    for (let i = 0; i < frames.length; i++) {
        lines.push(`file '${framePaths[i].replace(/\\/g, '/')}'`)
        lines.push(`duration ${frames[i].duration.toFixed(4)}`)
    }
    lines.push(`file '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'`)

    const concatPath = join(tmpDir, `bgconcat_s${sceneIndex}.txt`)
    await writeFile(concatPath, lines.join('\n'))

    const outputPath = join(tmpDir, `bgmotion_s${sceneIndex}.mp4`)
    await exec(
        `"${ffmpegPath}" -f concat -safe 0 -i "${concatPath}" ` +
        `-vf fps=${BG_FPS} -pix_fmt yuv420p -c:v libx264 -crf 18 -preset ultrafast ` +
        `-t ${sceneDuration.toFixed(4)} -y "${outputPath}"`
    )

    const { rm } = await import('fs/promises')
    await Promise.all([
        ...framePaths.map(p => rm(p, { force: true }).catch(() => {})),
        rm(concatPath, { force: true }).catch(() => {}),
    ])

    return outputPath
}

type BgEasingType = 'ease-in' | 'ease-out' | 'linear'

// 프레임 duration 재조정으로 시각적 easing 구현 (위치는 linear 유지)
// ease-in: 초반 느리게(duration 길게) → 후반 빠르게
// ease-out: 초반 빠르게 → 후반 느리게(duration 길게)
function applyBgEasing(
    frames: { buffer: Buffer; duration: number }[],
    easing: BgEasingType,
): { buffer: Buffer; duration: number }[] {
    if (easing === 'linear' || frames.length <= 1) return frames
    const totalDuration = frames.reduce((sum, f) => sum + f.duration, 0)
    const N = frames.length
    const weights = frames.map((_, i) => {
        const t = N > 1 ? i / (N - 1) : 0
        if (easing === 'ease-in') return 1 - t * 0.7   // 1.0 → 0.3
        else                       return t * 0.7 + 0.3  // 0.3 → 1.0
    })
    const sumW = weights.reduce((s, w) => s + w, 0)
    return frames.map((frame, i) => ({
        buffer: frame.buffer,
        duration: (weights[i] / sumW) * totalDuration,
    }))
}

/**
 * 완성된 영상 버퍼에서 특정 시점 프레임을 JPEG로 추출.
 * 씬1 텍스트가 모두 표시된 시점(기본 2.5초)을 썸네일로 사용.
 *
 * @param videoBuffer - 최종 MP4 버퍼
 * @param timeOffset  - 추출 시점(초), 기본값 2.5
 * @returns JPEG 버퍼 (실패 시 null)
 */
export async function extractThumbnailFromVideo(
    videoBuffer: Buffer,
    timeOffset = 2.5
): Promise<Buffer | null> {
    const ffmpegPath = getFfmpegPath()
    const tmpDir = join(tmpdir(), `thumb-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })

    const inputPath = join(tmpDir, 'input.mp4')
    const outputPath = join(tmpDir, 'thumb.jpg')

    try {
        await writeFile(inputPath, videoBuffer)
        await exec(
            `"${ffmpegPath}" -ss ${timeOffset.toFixed(2)} -i "${inputPath}" ` +
            `-frames:v 1 -q:v 2 -y "${outputPath}"`
        )
        const { readFile } = await import('fs/promises')
        return await readFile(outputPath)
    } catch (e) {
        console.warn('[extractThumbnailFromVideo] 추출 실패:', e)
        return null
    } finally {
        const { rm } = await import('fs/promises')
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
}

/** drawtext용 폰트 경로 결정 */
function resolveDrawtextFontPath(): string {
    return join(process.cwd(), 'public', 'fonts', 'Pretendard-Bold.ttf')
}

function getFfmpegPath(): string {
    const path = require('path')
    const fs = require('fs')

    const directPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if (fs.existsSync(directPath)) return directPath

    try {
        const ffmpegStatic = require('ffmpeg-static')
        if (ffmpegStatic && typeof ffmpegStatic === 'string') return ffmpegStatic
    } catch {}

    throw new Error('ffmpeg-static을 찾을 수 없습니다')
}

/**
 * ffmpeg -i 로 오디오 파일 Duration을 파싱.
 * ffmpeg은 출력 없으면 에러로 종료되지만 stderr에 Duration이 포함됨.
 */
async function probeAudioDuration(audioPath: string, ffmpegPath: string, fallback: number): Promise<number> {
    try {
        await exec(`"${ffmpegPath}" -i "${audioPath}"`)
    } catch (e: any) {
        const output: string = e.stderr ?? ''
        const match = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
        if (match) {
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
        }
    }
    return fallback
}

/**
 * 3개 배경 Scene + Scene별 텍스트 오버레이로 동영상 합성.
 *
 * @param sceneAudios - 씬별 TTS MP3 버퍼 3개. 모두 non-null이면 씬별 싱크 모드 활성화.
 * @param audioBuffer - 레거시 단일 오디오 (sceneAudios 없을 때 사용)
 * @returns MP4 Buffer
 */
export async function create3SceneVideo(
    backgrounds: [Buffer, Buffer, Buffer],
    textOverlays: Buffer | [Buffer, Buffer, Buffer],
    duration: number = 10,
    sceneTexts?: [string, string, string],
    sceneContents?: [SceneContent, SceneContent, SceneContent],
    audioBuffer?: Buffer,
    sceneAudios?: SceneAudios['buffers']
): Promise<Buffer> {
    const textArray: [Buffer, Buffer, Buffer] = Array.isArray(textOverlays)
        ? textOverlays
        : [textOverlays, textOverlays, textOverlays]

    const ffmpegPath = getFfmpegPath()
    const tmpId = Date.now()
    const tmpDir = join(tmpdir(), `shortform-${tmpId}`)
    await mkdir(tmpDir, { recursive: true })

    const bg1Path = join(tmpDir, 'bg1.png')
    const bg2Path = join(tmpDir, 'bg2.png')
    const bg3Path = join(tmpDir, 'bg3.png')
    const text1Path = join(tmpDir, 'text1.png')
    const text2Path = join(tmpDir, 'text2.png')
    const text3Path = join(tmpDir, 'text3.png')
    const video1Path = join(tmpDir, 'video1.mp4')
    const video2Path = join(tmpDir, 'video2.mp4')
    const video3Path = join(tmpDir, 'video3.mp4')
    const outputPath = join(tmpDir, 'output.mp4')

    try {
        await writeFile(bg1Path, backgrounds[0])
        await writeFile(bg2Path, backgrounds[1])
        await writeFile(bg3Path, backgrounds[2])
        await writeFile(text1Path, textArray[0])
        await writeFile(text2Path, textArray[1])
        await writeFile(text3Path, textArray[2])

        const transitionDuration = 0.15   // 씬1→2 전환
        const transitionDuration23 = 0.05  // 씬2→3 전환 (더 빠르게)
        const fps = 24
        const MIN_SCENE = 3.0
        const AUDIO_DELAY_MS = 300   // 씬1,2 목소리 시작 딜레이 (ms) — 텍스트 등장(150ms) 후 150ms 뒤
        const AUDIO_DELAY_MS_S3 = 900 // 씬3 목소리 시작 딜레이 (ms) — xfade concat 오프셋 보정 포함

        // ── STEP 0: 씬별 오디오 싱크 준비 ──────────────────────────────────
        const isSearchScene3 = !!(sceneContents && sceneContents[2]?.isSearchScene)

        const usePerSceneAudio = !!(
            sceneAudios &&
            sceneAudios[0] && sceneAudios[1] &&
            (isSearchScene3 || sceneAudios[2])
        )

        let audioPaths: [string, string, string] | null = null
        let sceneDurations: [number, number, number]

        if (usePerSceneAudio && sceneAudios) {
            const audio1Path = join(tmpDir, 'audio1.mp3')
            const audio2Path = join(tmpDir, 'audio2.mp3')
            const audio3Path = join(tmpDir, 'audio3.mp3')
            audioPaths = [audio1Path, audio2Path, audio3Path]

            const writeOps = [
                writeFile(audio1Path, sceneAudios[0]!),
                writeFile(audio2Path, sceneAudios[1]!),
            ]
            if (!isSearchScene3 && sceneAudios[2]) {
                writeOps.push(writeFile(audio3Path, sceneAudios[2]!))
            }
            await Promise.all(writeOps)

            const [d1, d2] = await Promise.all([
                probeAudioDuration(audio1Path, ffmpegPath, 4),
                probeAudioDuration(audio2Path, ffmpegPath, 4),
            ])
            const d3 = isSearchScene3 ? 0 : await probeAudioDuration(audio3Path, ffmpegPath, 4)

            const delayS = AUDIO_DELAY_MS / 1000
            sceneDurations = [
                Math.max(d1 + delayS + 0.4, MIN_SCENE),
                Math.max(d2 + delayS + 1.0, MIN_SCENE),
                isSearchScene3 ? 3.5 : Math.max(d3 + delayS + 1.0, MIN_SCENE),
            ]
            console.log('[FFmpeg] 씬별 싱크 모드 — 오디오 길이:', [d1, d2, d3].map(d => d.toFixed(2)), '→ 씬 duration:', sceneDurations)
        } else {
            const sd = (duration + 2 * transitionDuration) / 3
            sceneDurations = [sd, sd, sd]
        }

        // ── STEP 1: Sharp 타이핑 프레임 생성 ──────────────────────────────────
        let textAnimPaths: [string, string, string] | null = null

        if (sceneContents) {
            console.log('[FFmpeg] Sharp 타이핑 프레임 생성 중...')
            const [frames1, frames2] = await Promise.all([
                createTypingFrames(sceneContents[0].title, sceneContents[0].desc, 1, sceneDurations[0], sceneContents[0].highlights ?? []),
                createTypingFrames(sceneContents[1].title, sceneContents[1].desc, 2, sceneDurations[1], sceneContents[1].highlights ?? []),
            ])
            const frames3 = isSearchScene3
                ? await createSearchTypingFrames(sceneDurations[2])
                : await createTypingFrames(sceneContents[2].title, sceneContents[2].desc, 3, sceneDurations[2], sceneContents[2].highlights ?? [])

            console.log('[FFmpeg] 텍스트 애니메이션 영상 생성 중...')
            const [ta1, ta2, ta3] = await Promise.all([
                buildTextAnimationVideo(frames1, tmpDir, 1, ffmpegPath, sceneDurations[0], fps),
                buildTextAnimationVideo(frames2, tmpDir, 2, ffmpegPath, sceneDurations[1], fps),
                buildTextAnimationVideo(frames3, tmpDir, 3, ffmpegPath, sceneDurations[2], fps),
            ])
            textAnimPaths = [ta1, ta2, ta3]
        }

        // ── STEP 2: 씬별 비디오 생성 ──────────────────────────────────────────
        const encodeOpts = `-r 24 -c:v libx264 -crf 23 -preset faster -pix_fmt yuv420p`

        // filter_complex 빌더 — 항상 [vout] 출력
        const buildSceneFilter = (sceneNumber: number, dur: number, extraFilters: string[] = [], useTextAnim = false): string => {
            const frames = Math.ceil(dur * fps)
            const kb = getKenBurnsFilter(sceneNumber - 1, frames, fps)

            if (useTextAnim) {
                return (
                    `[0:v]scale=720:1280,${kb}[bg];` +
                    `[1:v]format=rgba,colorchannelmixer=aa=1[struct];` +
                    `[bg][struct]overlay=0:0[bgs];` +
                    `[2:v]format=rgba[textanim];` +
                    `[bgs][textanim]overlay=0:0[vout]`
                )
            }

            const base = extraFilters.length > 0
                ? `[0:v]scale=720:1280,${kb}[bg];[1:v]format=rgba,colorchannelmixer=aa=1[text];[bg][text]overlay=0:0,${extraFilters.join(',')}[vout]`
                : `[0:v]scale=720:1280,${kb}[bg];[1:v]format=rgba,colorchannelmixer=aa=1[text];[bg][text]overlay=0:0[vout]`
            return base
        }

        const bgPaths = [bg1Path, bg2Path, bg3Path]
        const textPaths = [text1Path, text2Path, text3Path]
        const videoPaths = [video1Path, video2Path, video3Path]

        if (textAnimPaths) {
            console.log('[FFmpeg] Scene별 비디오 생성 중 (Sharp 타이핑 + 씬별 오디오 싱크)...')
            for (let i = 0; i < 3; i++) {
                const dur = sceneDurations[i]
                const filter = buildSceneFilter(i + 1, dur, [], true)
                const hasAudio = audioPaths && !(isSearchScene3 && i === 2)
                const audioInput = hasAudio ? `-i "${audioPaths![i]}"` : ''
                const delay = hasAudio ? (i === 2 ? AUDIO_DELAY_MS_S3 : AUDIO_DELAY_MS) : 0
                const audioFilter = hasAudio ? `;[3:a]adelay=${delay}|${delay}[aout]` : ''
                const audioMap = hasAudio ? `-map "[aout]" -c:a aac` : ''
                await exec(
                    `"${ffmpegPath}" -loop 1 -i "${bgPaths[i]}" -loop 1 -i "${textPaths[i]}" -i "${textAnimPaths![i]}" ${audioInput} ` +
                    `-filter_complex "${filter}${audioFilter}" -map "[vout]" ${audioMap} ${encodeOpts} -t ${dur.toFixed(4)} -y "${videoPaths[i]}"`
                )
            }
        } else {
            // 레거시 drawtext 경로
            const fontPath = resolveDrawtextFontPath()
            console.log('[FFmpeg] Scene별 비디오 생성 중 (drawtext 레거시)...')
            for (let i = 0; i < 3; i++) {
                const dur = sceneDurations[i]
                const dtFilters = sceneTexts ? getTypingDrawtextFilters(sceneTexts[i], i + 1, 0, dur, fontPath) : []
                const filter = buildSceneFilter(i + 1, dur, dtFilters)
                const audioInput = audioPaths ? `-i "${audioPaths[i]}"` : ''
                const delay = audioPaths ? (i === 2 ? AUDIO_DELAY_MS_S3 : AUDIO_DELAY_MS) : 0
                const audioFilter = audioPaths ? `;[2:a]adelay=${delay}|${delay}[aout]` : ''
                const audioMap = audioPaths ? `-map "[aout]" -c:a aac` : ''
                await exec(
                    `"${ffmpegPath}" -loop 1 -i "${bgPaths[i]}" -loop 1 -i "${textPaths[i]}" ${audioInput} ` +
                    `-filter_complex "${filter}${audioFilter}" -map "[vout]" ${audioMap} ${encodeOpts} -t ${dur.toFixed(4)} -y "${videoPaths[i]}"`
                )
            }
        }

        // ── STEP 3: xfade 슬라이드 전환 합성 ──────────────────────────────────
        const [s1, s2] = sceneDurations
        const offset1 = s1 - 0.25
        const offset2 = s1 + s2 - transitionDuration23 - 0.25

        console.log('[FFmpeg] xfade 슬라이드 전환 합성 중...')

        if (usePerSceneAudio) {
            const audioConcat = isSearchScene3
                ? `[0:a][1:a]concat=n=2:v=0:a=1[aout]`
                : `[0:a][1:a][2:a]concat=n=3:v=0:a=1[aout]`
            await exec(
                `"${ffmpegPath}" -i "${video1Path}" -i "${video2Path}" -i "${video3Path}" ` +
                `-filter_complex ` +
                `"[0:v][1:v]xfade=transition=slideright:duration=${transitionDuration}:offset=${offset1.toFixed(4)}[v01];` +
                `[v01][2:v]xfade=transition=slideleft:duration=${transitionDuration23}:offset=${offset2.toFixed(4)}[vout];` +
                `${audioConcat}" ` +
                `-map "[vout]" -map "[aout]" ${encodeOpts} -c:a aac -movflags +faststart -y "${outputPath}"`
            )
        } else {
            await exec(
                `"${ffmpegPath}" -i "${video1Path}" -i "${video2Path}" -i "${video3Path}" ` +
                `-filter_complex "[0:v][1:v]xfade=transition=slideright:duration=${transitionDuration}:offset=${offset1.toFixed(4)}[v01];` +
                `[v01][2:v]xfade=transition=slideleft:duration=${transitionDuration23}:offset=${offset2.toFixed(4)}[vout]" ` +
                `-map "[vout]" ${encodeOpts} -movflags +faststart -y "${outputPath}"`
            )
        }

        // ── STEP 4: 레거시 단일 오디오 합성 (sceneAudios 없을 때만) ────────────
        let finalOutputPath = outputPath
        if (!usePerSceneAudio && audioBuffer) {
            const audioPath = join(tmpDir, 'narration.mp3')
            await writeFile(audioPath, audioBuffer)
            const audioOutputPath = join(tmpDir, 'output_audio.mp4')
            const totalDuration = s1 + sceneDurations[2] + s2 - transitionDuration
            await exec(
                `"${ffmpegPath}" -i "${outputPath}" -i "${audioPath}" ` +
                `-c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -t ${totalDuration.toFixed(4)} -y "${audioOutputPath}"`
            )
            finalOutputPath = audioOutputPath
        }

        const { readFile } = await import('fs/promises')
        return await readFile(finalOutputPath)
    } finally {
        try {
            const { rm } = await import('fs/promises')
            await rm(tmpDir, { recursive: true, force: true })
        } catch {}
    }
}

/**
 * N개 씬 슬라이드쇼 동영상 합성 (v2 전용).
 * sceneContents 마지막 씬에 isSearchScene=true 설정 시 검색 씬으로 처리.
 *
 * @param backgrounds  - N개 배경 버퍼 (content N-1 + search 1)
 * @param textOverlays - N개 구조 레이어 버퍼
 * @param sceneContents - N개 씬 콘텐츠
 * @param sceneAudios  - N개 TTS 버퍼 (null = 무음)
 */
export async function createNSceneVideo(
    backgrounds: Buffer[],
    textOverlays: Buffer[],
    sceneContents: SceneContent[],
    sceneAudios?: (Buffer | null)[]
): Promise<{ buffer: Buffer; scene1TextEndTime: number }> {
    const N = sceneContents.length
    if (N === 0) throw new Error('씬이 없습니다')

    const ffmpegPath = getFfmpegPath()
    const tmpId = Date.now()
    const tmpDir = join(tmpdir(), `shortform-n-${tmpId}`)
    await mkdir(tmpDir, { recursive: true })

    try {
        const textPaths = textOverlays.map((_, i) => join(tmpDir, `text${i}.png`))
        const videoPaths = backgrounds.map((_, i) => join(tmpDir, `video${i}.mp4`))

        await Promise.all(
            textOverlays.map((buf, i) => writeFile(textPaths[i], buf))
        )

        // ── STEP 0: 씬별 오디오 준비 ──────────────────────────────────────────
        const AUDIO_DELAY_MS = 50
        const MIN_SCENE = 3.0
        const SEARCH_SCENE_DUR = 3.5
        const TRANSITION_DUR = 0.1
        const fps = 24

        const hasSceneAudio = sceneContents.map((_sc, i) =>
            !!(sceneAudios && sceneAudios[i])
        )
        const usePerSceneAudio = hasSceneAudio.some(Boolean)

        const audioPaths: (string | null)[] = new Array(N).fill(null)
        const sceneDurations: number[] = sceneContents.map(sc =>
            sc.isSearchScene ? SEARCH_SCENE_DUR : MIN_SCENE
        )

        if (usePerSceneAudio && sceneAudios) {
            const writeOps: Promise<void>[] = []
            for (let i = 0; i < N; i++) {
                if (hasSceneAudio[i] && sceneAudios[i]) {
                    const ap = join(tmpDir, `audio${i}.mp3`)
                    audioPaths[i] = ap
                    writeOps.push(writeFile(ap, sceneAudios[i]!))
                }
            }
            await Promise.all(writeOps)

            const delayS = AUDIO_DELAY_MS / 1000
            await Promise.all(
                audioPaths.map(async (ap, i) => {
                    if (ap) {
                        const d = await probeAudioDuration(ap, ffmpegPath, 4)
                        sceneDurations[i] = Math.max(d + delayS + (i === 0 ? 0.4 : 1.0), MIN_SCENE)
                    }
                })
            )
            console.log('[FFmpeg N] 씬 duration:', sceneDurations.map(d => d.toFixed(2)))
        }

        // ── Scene 1 텍스트 완성 시점 계산 (썸네일 추출 타임스탬프) ───────────────
        const sc0 = sceneContents[0]
        let scene1TextEndTime: number
        if (!sc0?.isSearchScene) {
            const titleWc = (sc0?.title ?? '').split(' ').filter(Boolean).length
            const descWc  = (sc0?.desc  ?? '').split(' ').filter(Boolean).length
            const totalWc = titleWc + descWc
            if (totalWc > 0) {
                const d0 = sceneDurations[0]
                const wordDelay = Math.min(0.33, (d0 * 0.85) / totalWc)
                scene1TextEndTime = Math.min(0.15 + (totalWc - 1) * wordDelay + 0.1, d0 - 0.1)
            } else {
                scene1TextEndTime = sceneDurations[0] * 0.5
            }
        } else {
            scene1TextEndTime = SEARCH_SCENE_DUR * 0.5
        }

        // ── STEP 0.5: 배경 모션 비디오 생성 (Sharp 프레임 → MP4) ────────────────
        // zoompan 필터 대신 Sharp crop+resize로 easing 곡선 완전 제어.
        // BG_MOTION_CYCLE 순서로 씬마다 다른 모션 패턴 적용.
        // 마지막 일반씬 + 검색바씬: 동일 모션·배경을 50/50 분할해 끊김없이 이어받기.
        console.log('[FFmpeg N] 배경 모션 프레임 생성 중...')
        const bgMotionPaths: string[] = []
        for (let i = 0; i < backgrounds.length; i++) {
            const bgBuf = backgrounds[i]
            const isSearch = !!sceneContents[i]?.isSearchScene
            const isLastBeforeSearch = !isSearch && !!sceneContents[i + 1]?.isSearchScene

            const motionType = isSearch
                ? BG_MOTION_CYCLE[(i - 1) % BG_MOTION_CYCLE.length]
                : BG_MOTION_CYCLE[i % BG_MOTION_CYCLE.length]

            let bgBufToUse = bgBuf
            let startT = 0
            let endT = 1

            if (isSearch && i > 0) {
                bgBufToUse = backgrounds[i - 1]
                const prevDur = sceneDurations[i - 1]
                const searchDur = sceneDurations[i]
                startT = prevDur / (prevDur + searchDur)
            } else if (isLastBeforeSearch) {
                const prevDur = sceneDurations[i]
                const searchDur = sceneDurations[i + 1]
                endT = prevDur / (prevDur + searchDur)
            }

            const bgEasing: BgEasingType =
                i === 0              ? 'ease-in'  :  // 첫 씬: 느리게 출발
                isSearch             ? 'ease-out' :  // 검색바씬: 느리게 마무리
                isLastBeforeSearch   ? 'linear'   :  // 마지막 콘텐츠 씬: 일정 속도로 검색바에 연결
                'linear'                             // 중간 씬: 일정 속도

            const rawFrames = await createBackgroundFrames(bgBufToUse, motionType, sceneDurations[i], BG_FPS, startT, endT)
            const frames = applyBgEasing(rawFrames, bgEasing)
            bgMotionPaths.push(await buildBackgroundMotionVideo(frames, tmpDir, i, ffmpegPath, sceneDurations[i]))
        }

        // ── STEP 1: Sharp 타이핑 프레임 생성 ────────────────────────────────────
        console.log('[FFmpeg N] 텍스트 애니메이션 영상 생성 중...')
        const textAnimPaths: string[] = []
        for (let i = 0; i < sceneContents.length; i++) {
            const sc = sceneContents[i]
            if (!sc.isSearchScene) {
                console.log(`[textanim] scene${i+1} desc="${sc.desc?.slice(0,20)}" highlights=[${(sc.highlights ?? []).join(',')}]`)
            }
            const frames = sc.isSearchScene
                ? await createSearchTypingFrames(sceneDurations[i])
                : await createTypingFrames(sc.title, sc.desc, i + 1, sceneDurations[i], sc.highlights ?? [])
            textAnimPaths.push(await buildTextAnimationVideo(frames, tmpDir, i, ffmpegPath, sceneDurations[i], fps))
        }

        // ── STEP 2: 씬별 비디오 합성 ─────────────────────────────────────────────
        // 입력 순서: [0] bgMotion.mp4 | [1] textOverlay(loop) | [2] textAnim.mkv | [3] audio(optional)
        // zoompan 제거 — 배경 모션은 STEP 0.5에서 Sharp로 이미 처리됨.
        const encodeOpts = `-r 24 -c:v libx264 -crf 23 -preset faster -pix_fmt yuv420p`
        console.log('[FFmpeg N] Scene별 비디오 생성 중...')

        for (let i = 0; i < N; i++) {
            const dur = sceneDurations[i]
            const hasAudio = !!audioPaths[i]
            const audioInput = hasAudio ? `-i "${audioPaths[i]}"` : ''
            const delay = hasAudio ? AUDIO_DELAY_MS : 0
            const audioFilter = hasAudio ? `;[3:a]adelay=${delay}|${delay}[aout]` : ''
            const audioMap = hasAudio ? `-map "[aout]" -c:a aac` : ''

            const filter =
                `[1:v]format=rgba,colorchannelmixer=aa=1[struct];` +
                `[0:v][struct]overlay=0:0[bgs];` +
                `[2:v]format=rgba[textanim];` +
                `[bgs][textanim]overlay=0:0[vout]`

            await exec(
                `"${ffmpegPath}" -i "${bgMotionPaths[i]}" -loop 1 -i "${textPaths[i]}" -i "${textAnimPaths[i]}" ${audioInput} ` +
                `-filter_complex "${filter}${audioFilter}" -map "[vout]" ${audioMap} ${encodeOpts} -t ${dur.toFixed(4)} -y "${videoPaths[i]}"`
            )
        }

        // ── STEP 3: 씬 전환 합성 ─────────────────────────────────────────────────
        // 같은 이미지 공유 씬 쌍(i%2==0) → concat (전환 효과 없음)
        // 이미지 바뀌는 구간 또는 검색씬 진입 → xfade
        const outputPath = join(tmpDir, 'output.mp4')
        const videoInputs = videoPaths.map(p => `-i "${p}"`).join(' ')

        if (N === 1) {
            const { readFile } = await import('fs/promises')
            return { buffer: await readFile(videoPaths[0]), scene1TextEndTime }
        }

        // 씬별 이미지 1:1 배정 — 검색씬 진입 직전만 같은 이미지(fade), 나머지는 슬라이드
        const isSameImagePair = (i: number): boolean =>
            !!(sceneContents[i + 1]?.isSearchScene)

        const transitions = ['slideright', 'slideleft']
        const videoFilterParts: string[] = []
        // xfade 전환이 시작되는 output 타임라인 시각 (씬 i→i+1)
        // 오디오 adelay 계산에 재사용
        const xfadeOffsets: number[] = []
        let cumDur = 0
        let cumEarlyStart = 0  // 누적 earlyStart (정확한 xfade output 타임라인 추적용)
        let prevLabel = '[0:v]'
        let xfadeCount = 0

        for (let i = 0; i < N - 1; i++) {
            cumDur += sceneDurations[i]
            // earlyStart: 이전 클립이 끝나기 몇 초 전에 전환을 시작할지.
            // 같은 배경(fade) → TRANSITION_DUR(0.1s): 줌 연속성 유지, 프레임 차이 최소화.
            // 다른 배경(slide) → 0.25s: 자연스러운 슬라이드 연출.
            //
            // offset 공식: cumDur - cumEarlyStart
            //   각 xfade output duration = offset_k + D_{k+1}
            //   다음 xfade의 remaining = e_k (현재 earlyStart) → 항상 양수 보장.
            //   i * TRANSITION_DUR 공식은 earlyStart가 균일할 때만 정확하므로 사용 금지.
            const earlyStart = isSameImagePair(i) ? TRANSITION_DUR : 0.25
            cumEarlyStart += earlyStart
            const offset = Math.max(cumDur - cumEarlyStart, 0.1)
            xfadeOffsets.push(offset)
            const outLabel = i < N - 2 ? `[v${i}]` : '[vout]'
            const trans = isSameImagePair(i) ? 'fade' : transitions[xfadeCount % 2]

            videoFilterParts.push(
                `${prevLabel}[${i + 1}:v]xfade=transition=${trans}:duration=${TRANSITION_DUR}:offset=${offset.toFixed(4)}${outLabel}`
            )

            if (!isSameImagePair(i)) xfadeCount++
            prevLabel = outLabel
        }

        // 오디오: concat 대신 amix+adelay로 xfade offset 기반 싱크 보정
        // concat은 scene duration을 단순 누적하므로 xfade 전환마다 0.1s씩 drift 발생.
        // 씬 k의 오디오를 xfadeOffsets[k-1] 시각에 배치하면 TTS가 씬 k 전환 직후에 재생됨.
        const audioSceneIndices = hasSceneAudio
            .map((has, i) => (has ? i : -1))
            .filter(i => i >= 0)

        let filterComplex = videoFilterParts.join(';')
        let audioMapArg = ''

        if (usePerSceneAudio && audioSceneIndices.length > 0) {
            const amixParts: string[] = []
            const amixLabels: string[] = []
            for (let j = 0; j < audioSceneIndices.length; j++) {
                const si = audioSceneIndices[j]
                // 씬 0은 t=0, 씬 k>0는 xfade 전환 시작 시각
                const delayMs = si === 0
                    ? 0
                    : Math.max(Math.round(xfadeOffsets[si - 1] * 1000), 0)
                amixParts.push(`[${si}:a]adelay=${delayMs}|${delayMs}[amixA${j}]`)
                amixLabels.push(`[amixA${j}]`)
            }
            filterComplex += `;${amixParts.join(';')}`
            filterComplex += `;${amixLabels.join('')}amix=inputs=${amixParts.length}:normalize=0[aout]`
            audioMapArg = `-map "[aout]" -c:a aac`
        }

        console.log('[FFmpeg N] xfade 합성 중...')
        await exec(
            `"${ffmpegPath}" ${videoInputs} ` +
            `-filter_complex "${filterComplex}" ` +
            `-map "[vout]" ${audioMapArg} ${encodeOpts} -movflags +faststart -y "${outputPath}"`
        )

        const { readFile } = await import('fs/promises')
        return { buffer: await readFile(outputPath), scene1TextEndTime }
    } finally {
        try {
            const { rm } = await import('fs/promises')
            await rm(tmpDir, { recursive: true, force: true })
        } catch {}
    }
}
