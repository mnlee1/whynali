/**
 * lib/shortform/create-multi-video.ts
 * 
 * 3개 Scene 이미지를 하나의 동영상으로 합성
 */

import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import { writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getTypingDrawtextFilters, createTypingFrames } from './generate-scenes'

/**
 * Sharp 타이핑 프레임 배열을 RGBA 영상(MKV/PNG코덱)으로 변환.
 * drawtext 없이 타이핑 애니메이션을 구현하기 위한 중간 영상.
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

    // ffconcat 리스트 (마지막 항목은 duration 없이 추가 — ffconcat 스펙)
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

    return outputPath
}

/** 씬별 텍스트 콘텐츠 (FFmpeg drawtext 렌더링용) */
export interface SceneContent {
    title: string
    desc: string
}

const exec = promisify(execCallback)

/**
 * Ken Burns 효과 (zoompan) 필터 문자열 반환.
 * 씬별로 확대 방향을 다르게 적용해 단조로움을 방지.
 *
 * @param sceneIndex - 0부터 시작 (씬 번호 - 1)
 * @param frames - 씬 총 프레임 수
 * @param fps - 프레임레이트
 */
function getKenBurnsFilter(sceneIndex: number, frames: number, fps: number): string {
    // 1.0 → 1.15 으로 자연스럽게 확대 (frames 동안)
    const zExpr = `min(zoom+${(0.15 / frames).toFixed(5)},1.15)`
    const yExpr = `ih/2-(ih/zoom/2)`

    let xExpr: string
    if (sceneIndex === 0) {
        // 씬1: 왼쪽에서 오른쪽으로 천천히 이동
        xExpr = `on*0.4`
    } else if (sceneIndex === 1) {
        // 씬2: 오른쪽에서 왼쪽으로 천천히 이동
        xExpr = `max(44-on*0.4,0)`
    } else {
        // 씬3: 중앙 고정 줌인
        xExpr = `iw/2-(iw/zoom/2)`
    }

    return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:fps=${fps}:s=1080x1920`
}

/** drawtext용 폰트 경로 결정. 우선순위: Pretendard → 맑은 고딕 → 빈 문자열(fontfile 생략) */
function resolveDrawtextFontPath(): string {
    const fs = require('fs')
    const pretendard = join(process.cwd(), 'public', 'fonts', 'Pretendard-Bold.ttf')
    if (fs.existsSync(pretendard)) return pretendard
    const malgun = 'C:/Windows/Fonts/malgun.ttf'
    if (fs.existsSync(malgun)) return malgun
    return ''
}

function getFfmpegPath(): string {
    const path = require('path')
    const fs = require('fs')
    
    const directPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    
    if (fs.existsSync(directPath)) {
        return directPath
    }
    
    try {
        const ffmpegStatic = require('ffmpeg-static')
        if (ffmpegStatic && typeof ffmpegStatic === 'string') {
            return ffmpegStatic
        }
    } catch {}
    
    throw new Error('ffmpeg-static을 찾을 수 없습니다')
}

/**
 * 3개 배경 Scene + Scene별 텍스트 오버레이로 10초 동영상 합성.
 * 씬2는 오른쪽에서, 씬3는 왼쪽에서 슬라이드 전환 (xfade).
 *
 * @param backgrounds - 3개 배경 PNG Buffer [scene1, scene2, scene3]
 * @param textOverlays - 3개 텍스트 레이어 PNG Buffer (투명 배경) [text1, text2, text3]
 * @param duration - 총 길이 (초, 기본값 10)
 * @param sceneTexts - 씬별 자막 텍스트 (전달 시 drawtext 타이핑 효과 적용)
 * @returns MP4 Buffer
 */
export async function create3SceneVideo(
    backgrounds: [Buffer, Buffer, Buffer],
    textOverlays: Buffer | [Buffer, Buffer, Buffer],
    duration: number = 10,
    sceneTexts?: [string, string, string],
    sceneContents?: [SceneContent, SceneContent, SceneContent]
): Promise<Buffer> {
    // 레거시 호환: Buffer 하나만 전달된 경우 3개로 복제
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

        const transitionDuration = 0.5
        const fps = 30
        // 총 duration이 정확히 나오도록 전환 겹침 보정: 3*scene - 2*transition = duration
        const sceneDuration = (duration + 2 * transitionDuration) / 3

        // ── sceneContents 전달 시: Sharp 타이핑 프레임 방식 (drawtext 불필요) ──────
        // sceneContents 없으면 레거시 drawtext 경로 사용 (로컬 개발/fallback)
        let textAnimPaths: [string, string, string] | null = null

        if (sceneContents) {
            // STEP 1a: Sharp+SVG로 단어별 타이핑 프레임 PNG 생성
            console.log('[FFmpeg] Sharp 타이핑 프레임 생성 중...')
            const frames1 = await createTypingFrames(sceneContents[0].title, sceneContents[0].desc, 1, sceneDuration)
            const frames2 = await createTypingFrames(sceneContents[1].title, sceneContents[1].desc, 2, sceneDuration)
            const frames3 = await createTypingFrames(sceneContents[2].title, sceneContents[2].desc, 3, sceneDuration)

            // STEP 1b: 프레임 시퀀스를 RGBA 영상(MKV)으로 변환
            console.log('[FFmpeg] 텍스트 애니메이션 영상 생성 중...')
            const [ta1, ta2, ta3] = await Promise.all([
                buildTextAnimationVideo(frames1, tmpDir, 1, ffmpegPath, sceneDuration, fps),
                buildTextAnimationVideo(frames2, tmpDir, 2, ffmpegPath, sceneDuration, fps),
                buildTextAnimationVideo(frames3, tmpDir, 3, ffmpegPath, sceneDuration, fps),
            ])
            textAnimPaths = [ta1, ta2, ta3]
        }

        // 씬 필터 빌더 (모드에 따라 분기)
        const buildSceneFilter = (sceneNumber: number, extraFilters: string[] = [], useTextAnim = false): string => {
            const frames = Math.ceil(sceneDuration * fps)
            const kb = getKenBurnsFilter(sceneNumber - 1, frames, fps)

            if (useTextAnim) {
                // 3입력 모드: [0:v]=배경, [1:v]=구조레이어(로고+버튼), [2:v]=텍스트애니메이션
                return (
                    `[0:v]scale=1080:1920,${kb}[bg];` +
                    `[1:v]format=rgba,colorchannelmixer=aa=1[struct];` +
                    `[bg][struct]overlay=0:0[bgs];` +
                    `[2:v]format=rgba[textanim];` +
                    `[bgs][textanim]overlay=0:0`
                )
            }

            // 기존 2입력 + drawtext 모드 (레거시 fallback)
            const base = `[0:v]scale=1080:1920,${kb}[bg];[1:v]format=rgba,colorchannelmixer=aa=1[text];[bg][text]overlay=0:0`
            return extraFilters.length > 0 ? `${base},${extraFilters.join(',')}` : base
        }

        // STEP 2: Scene별 개별 비디오 생성
        if (textAnimPaths) {
            console.log('[FFmpeg] Scene별 비디오 생성 중 (Sharp 타이핑 애니메이션)...')
            await exec(`"${ffmpegPath}" -loop 1 -i "${bg1Path}" -loop 1 -i "${text1Path}" -i "${textAnimPaths[0]}" -filter_complex "${buildSceneFilter(1, [], true)}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video1Path}"`)
            await exec(`"${ffmpegPath}" -loop 1 -i "${bg2Path}" -loop 1 -i "${text2Path}" -i "${textAnimPaths[1]}" -filter_complex "${buildSceneFilter(2, [], true)}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video2Path}"`)
            await exec(`"${ffmpegPath}" -loop 1 -i "${bg3Path}" -loop 1 -i "${text3Path}" -i "${textAnimPaths[2]}" -filter_complex "${buildSceneFilter(3, [], true)}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video3Path}"`)
        } else {
            // 레거시 drawtext 경로
            const fontPath = resolveDrawtextFontPath()
            let drawtextFilters: [string[], string[], string[]] = [[], [], []]
            if (sceneTexts) {
                drawtextFilters = [
                    getTypingDrawtextFilters(sceneTexts[0], 1, 0, sceneDuration, fontPath),
                    getTypingDrawtextFilters(sceneTexts[1], 2, 0, sceneDuration, fontPath),
                    getTypingDrawtextFilters(sceneTexts[2], 3, 0, sceneDuration, fontPath),
                ]
            }
            console.log('[FFmpeg] Scene별 비디오 3개 생성 중 (drawtext 레거시)...')
            await exec(`"${ffmpegPath}" -loop 1 -i "${bg1Path}" -loop 1 -i "${text1Path}" -filter_complex "${buildSceneFilter(1, drawtextFilters[0])}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video1Path}"`)
            await exec(`"${ffmpegPath}" -loop 1 -i "${bg2Path}" -loop 1 -i "${text2Path}" -filter_complex "${buildSceneFilter(2, drawtextFilters[1])}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video2Path}"`)
            await exec(`"${ffmpegPath}" -loop 1 -i "${bg3Path}" -loop 1 -i "${text3Path}" -filter_complex "${buildSceneFilter(3, drawtextFilters[2])}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video3Path}"`)
        }

        // STEP 3: xfade로 슬라이드 전환 합성
        // offset1: 씬1 끝 0.25초 전
        // offset2: [v01](=2*scene-transition) 끝 0.25초 전 — 첫 번째 xfade 겹침 반영
        const offset1 = sceneDuration - 0.25
        const offset2 = 2 * sceneDuration - transitionDuration - 0.25

        console.log('[FFmpeg] xfade 슬라이드 전환 합성 중...')
        await exec(
            `"${ffmpegPath}" -i "${video1Path}" -i "${video2Path}" -i "${video3Path}" ` +
            `-filter_complex "[0:v][1:v]xfade=transition=slideright:duration=${transitionDuration}:offset=${offset1}[v01];` +
            `[v01][2:v]xfade=transition=slideleft:duration=${transitionDuration}:offset=${offset2}[vout]" ` +
            `-map "[vout]" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`
        )

        const { readFile } = await import('fs/promises')
        const videoBuffer = await readFile(outputPath)

        return videoBuffer
    } finally {
        // tmpDir 전체 정리 (타이핑 프레임 PNG, MKV, 씬 MP4 등 모두 포함)
        try {
            const { rm } = await import('fs/promises')
            await rm(tmpDir, { recursive: true, force: true })
        } catch {}
    }
}
