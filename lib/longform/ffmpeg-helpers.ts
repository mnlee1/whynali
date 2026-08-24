/**
 * lib/longform/ffmpeg-helpers.ts
 *
 * 옴니버스 롱폼 생성 과정에서 공통으로 쓰는 저수준 ffmpeg 유틸리티.
 */

import { writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { exec as execCallback } from 'child_process'

const exec = promisify(execCallback)

export function getFfmpegPath(): string {
    const directPath = join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if (existsSync(directPath)) return directPath
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static')
    if (typeof ffmpegStatic === 'string') return ffmpegStatic
    throw new Error('ffmpeg-static을 찾을 수 없습니다')
}

/** ffmpeg -i 의 stderr에서 Duration 파싱 (project 관례 재사용) */
export async function probeDuration(filePath: string, ffmpegPath: string, fallback: number): Promise<number> {
    try {
        await exec(`"${ffmpegPath}" -i "${filePath}"`)
        return fallback
    } catch (e) {
        const output: string = (e as { stderr?: string }).stderr ?? ''
        const match = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
        if (match) return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
        return fallback
    }
}

export async function hasAudioStream(filePath: string, ffmpegPath: string): Promise<boolean> {
    try {
        await exec(`"${ffmpegPath}" -i "${filePath}"`)
        return false
    } catch (e) {
        return /Stream #.*Audio:/.test((e as { stderr?: string }).stderr ?? '')
    }
}

export interface SequenceFrame {
    buffer: Buffer
    duration: number
}

async function writeConcatList(frames: SequenceFrame[], tmpDir: string, label: string): Promise<{ concatPath: string; framePaths: string[] }> {
    const framePaths: string[] = []
    for (let i = 0; i < frames.length; i++) {
        const framePath = join(tmpDir, `${label}_f${i}.png`)
        await writeFile(framePath, frames[i].buffer)
        framePaths.push(framePath)
    }

    const lines = ['ffconcat version 1.0']
    for (let i = 0; i < frames.length; i++) {
        lines.push(`file '${framePaths[i].replace(/\\/g, '/')}'`)
        lines.push(`duration ${frames[i].duration.toFixed(4)}`)
    }
    lines.push(`file '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'`)

    const concatPath = join(tmpDir, `${label}_concat.txt`)
    await writeFile(concatPath, lines.join('\n'))
    return { concatPath, framePaths }
}

/** 프레임 시퀀스를 ffconcat으로 mp4(h264)로 변환. lib/shortform/create-multi-video.ts의 buildTextAnimationVideo와 동일한 기법(알파 없는 배경용). */
export async function buildFrameSequenceVideo(
    frames: SequenceFrame[],
    tmpDir: string,
    label: string,
    ffmpegPath: string,
    totalDuration: number,
    fps: number
): Promise<string> {
    const { concatPath } = await writeConcatList(frames, tmpDir, label)
    const outPath = join(tmpDir, `${label}.mp4`)
    await exec(
        `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatPath}" ` +
        `-vf fps=${fps} -pix_fmt yuv420p -c:v libx264 -t ${totalDuration.toFixed(4)} "${outPath}"`
    )
    return outPath
}

/** 알파 채널 보존 프레임 시퀀스 → mkv(png 코덱). lib/shortform/create-multi-video.ts의 buildTextAnimationVideo와 동일 기법(텍스트 오버레이용). */
export async function buildAlphaFrameSequenceVideo(
    frames: SequenceFrame[],
    tmpDir: string,
    label: string,
    ffmpegPath: string,
    totalDuration: number,
    fps: number
): Promise<string> {
    const { concatPath } = await writeConcatList(frames, tmpDir, label)
    const outPath = join(tmpDir, `${label}.mkv`)
    await exec(
        `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatPath}" ` +
        `-vf fps=${fps} -pix_fmt rgba -c:v png -t ${totalDuration.toFixed(4)} "${outPath}"`
    )
    return outPath
}

export async function downloadFile(url: string, destPath: string): Promise<void> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${url}`)
    await writeFile(destPath, Buffer.from(await res.arrayBuffer()))
}

export { exec }
