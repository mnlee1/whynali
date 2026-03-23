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

const exec = promisify(execCallback)

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
 * 3개 배경 Scene + Scene별 텍스트 오버레이로 10초 동영상 합성
 * 
 * @param backgrounds - 3개 배경 PNG Buffer [scene1, scene2, scene3]
 * @param textOverlays - 3개 텍스트 레이어 PNG Buffer (투명 배경) [text1, text2, text3]
 * @param duration - 총 길이 (초, 기본값 10)
 * @returns MP4 Buffer
 */
export async function create3SceneVideo(
    backgrounds: [Buffer, Buffer, Buffer],
    textOverlays: Buffer | [Buffer, Buffer, Buffer],
    duration: number = 10
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
    const outputPath = join(tmpDir, 'output.mp4')
    const video1Path = join(tmpDir, 'video1.mp4')
    const video2Path = join(tmpDir, 'video2.mp4')
    const video3Path = join(tmpDir, 'video3.mp4')

    try {
        // 배경 3개 + 텍스트 레이어 3개 저장
        await writeFile(bg1Path, backgrounds[0])
        await writeFile(bg2Path, backgrounds[1])
        await writeFile(bg3Path, backgrounds[2])
        await writeFile(text1Path, textArray[0])
        await writeFile(text2Path, textArray[1])
        await writeFile(text3Path, textArray[2])

        // 각 Scene 길이 계산 (10초 → 각 3.33초)
        const sceneDuration = duration / 3
        const fadeDuration = 0.5
        const fps = 30

        // STEP 1: Scene별로 배경 + 텍스트 합성한 개별 비디오 생성
        
        console.log('[FFmpeg] Scene별 비디오 3개 생성 중 (배경+텍스트)...')
        
        // Scene 1: 배경 + 텍스트1
        await exec(`"${ffmpegPath}" -loop 1 -i "${bg1Path}" -loop 1 -i "${text1Path}" -filter_complex "[0:v]scale=1080:1920,fps=${fps}[bg];[1:v]format=rgba,colorchannelmixer=aa=1[text];[bg][text]overlay=0:0,fade=t=out:st=${sceneDuration - fadeDuration}:d=${fadeDuration}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video1Path}"`)
        
        // Scene 2: 배경 + 텍스트2
        await exec(`"${ffmpegPath}" -loop 1 -i "${bg2Path}" -loop 1 -i "${text2Path}" -filter_complex "[0:v]scale=1080:1920,fps=${fps}[bg];[1:v]format=rgba,colorchannelmixer=aa=1[text];[bg][text]overlay=0:0,fade=t=in:st=0:d=${fadeDuration},fade=t=out:st=${sceneDuration - fadeDuration}:d=${fadeDuration}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video2Path}"`)
        
        // Scene 3: 배경 + 텍스트3
        await exec(`"${ffmpegPath}" -loop 1 -i "${bg3Path}" -loop 1 -i "${text3Path}" -filter_complex "[0:v]scale=1080:1920,fps=${fps}[bg];[1:v]format=rgba,colorchannelmixer=aa=1[text];[bg][text]overlay=0:0,fade=t=in:st=0:d=${fadeDuration}" -c:v libx264 -pix_fmt yuv420p -t ${sceneDuration} -y "${video3Path}"`)
        
        // STEP 2: 3개 Scene을 concat으로 이어붙이기
        const concatListPath = join(tmpDir, 'concat.txt')
        await writeFile(concatListPath, `file '${video1Path.replace(/\\/g, '/')}'\nfile '${video2Path.replace(/\\/g, '/')}'\nfile '${video3Path.replace(/\\/g, '/')}'`)
        
        console.log('[FFmpeg] Scene 병합 중...')
        await exec(`"${ffmpegPath}" -f concat -safe 0 -i "${concatListPath}" -c copy -movflags +faststart -y "${outputPath}"`)
        
        const { readFile } = await import('fs/promises')
        const videoBuffer = await readFile(outputPath)
        
        return videoBuffer
    } finally {
        // 임시 파일 정리
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
            await unlink(join(tmpDir, 'concat.txt')).catch(() => {})
            await unlink(outputPath).catch(() => {})
        } catch {}
    }
}
