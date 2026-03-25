/**
 * lib/shortform/create-multi-video.ts
 * 
 * 3개 Scene 이미지를 하나의 동영상으로 합성
 */

import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getTypingDrawtextFilters, getSceneTextDrawtextFilters } from './generate-scenes'

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

        // sceneTexts 전달 시 drawtext 필터 생성 (각 씬 MP4는 t=0 기준 로컬 타임)
        const buildSceneFilter = (sceneNumber: number, extraFilters: string[] = []): string => {
            const frames = Math.ceil(sceneDuration * fps)
            const kb = getKenBurnsFilter(sceneNumber - 1, frames, fps)
            // zoompan이 fps를 내장하므로 별도 fps 필터 불필요
            const base = `[0:v]scale=1080:1920,${kb}[bg];[1:v]format=rgba,colorchannelmixer=aa=1[text];[bg][text]overlay=0:0`
            return extraFilters.length > 0 ? `${base},${extraFilters.join(',')}` : base
        }

        const fontPath = resolveDrawtextFontPath()

        // typing effect 필터 (sceneTexts 전달 시)
        let drawtextFilters: [string[], string[], string[]] = [[], [], []]
        if (sceneTexts) {
            drawtextFilters = [
                getTypingDrawtextFilters(sceneTexts[0], 1, 0, sceneDuration, fontPath),
                getTypingDrawtextFilters(sceneTexts[1], 2, 0, sceneDuration, fontPath),
                getTypingDrawtextFilters(sceneTexts[2], 3, 0, sceneDuration, fontPath),
            ]
        }

        // 정적/타이핑 텍스트 필터 (sceneContents 전달 시)
        if (sceneContents) {
            for (let i = 0; i < 3; i++) {
                const textFilters = getSceneTextDrawtextFilters(
                    sceneContents[i].title,
                    sceneContents[i].desc,
                    i + 1,         // sceneNumber
                    fontPath,
                    true,          // typing effect
                    sceneDuration
                )
                drawtextFilters[i] = [...drawtextFilters[i], ...textFilters]
            }
        }

        // STEP 1: Scene별 개별 비디오 생성 (fade 없음)
        console.log('[FFmpeg] Scene별 비디오 3개 생성 중...')

        await exec(`"${ffmpegPath}" -loop 1 -i "${bg1Path}" -loop 1 -i "${text1Path}" -filter_complex "${buildSceneFilter(1, drawtextFilters[0])}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video1Path}"`)
        await exec(`"${ffmpegPath}" -loop 1 -i "${bg2Path}" -loop 1 -i "${text2Path}" -filter_complex "${buildSceneFilter(2, drawtextFilters[1])}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video2Path}"`)
        await exec(`"${ffmpegPath}" -loop 1 -i "${bg3Path}" -loop 1 -i "${text3Path}" -filter_complex "${buildSceneFilter(3, drawtextFilters[2])}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video3Path}"`)

        // STEP 2: xfade로 슬라이드 전환 합성
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
        try {
            await unlink(bg1Path).catch(() => {})
            await unlink(bg2Path).catch(() => {})
            await unlink(bg3Path).catch(() => {})
            await unlink(text1Path).catch(() => {})
            await unlink(text2Path).catch(() => {})
            await unlink(text3Path).catch(() => {})
            await unlink(video1Path).catch(() => {})
            await unlink(video2Path).catch(() => {})
            await unlink(video3Path).catch(() => {})
            await unlink(outputPath).catch(() => {})
        } catch {}
    }
}
