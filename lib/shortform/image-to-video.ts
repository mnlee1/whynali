/**
 * lib/shortform/image-to-video.ts
 * 
 * FFmpeg 이미지 → 동영상 변환
 * 
 * PNG 이미지를 15초 MP4 동영상으로 변환합니다.
 * zoom_fade 효과를 적용하여 자연스러운 모션을 제공합니다.
 * 
 * 의존성: ffmpeg-static (패키지 설치 필요)
 * npm install ffmpeg-static
 */

import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
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

export interface ImageToVideoOptions {
    duration?: number
    effect?: 'zoom_in' | 'zoom_out' | 'zoom_fade' | 'pan_left' | 'pan_right' | 'Ken_burns' | 'none'
}

/**
 * 이미지 → 동영상 변환 (FFmpeg)
 * 
 * @param imageBuffer - PNG 이미지 버퍼
 * @param options - 변환 옵션
 * @returns MP4 동영상 버퍼
 * @throws ffmpeg 실행 실패 시 throw
 */
export async function convertImageToVideo(
    imageBuffer: Buffer,
    options: ImageToVideoOptions = {}
): Promise<Buffer> {
    const duration = options.duration ?? 15
    const effect = options.effect ?? 'zoom_fade'

    const ffmpegPath = getFfmpegPath()

    const tmpInput = join(tmpdir(), `shortform-input-${Date.now()}.png`)
    const tmpOutput = join(tmpdir(), `shortform-output-${Date.now()}.mp4`)

    try {
        await writeFile(tmpInput, imageBuffer)

        const filterComplex = getFilterComplex(effect, duration)

        const command = [
            `"${ffmpegPath}"`,
            '-loop 1',
            `-i "${tmpInput}"`,
            `-t ${duration}`,
            filterComplex,
            '-c:v libx264',
            '-pix_fmt yuv420p',
            '-movflags +faststart',
            '-y',
            `"${tmpOutput}"`,
        ].join(' ')

        console.log('[FFmpeg 실행]', command)
        const { stdout, stderr } = await exec(command)
        
        if (stderr) {
            console.log('[FFmpeg stderr]', stderr)
        }

        const { readFile } = await import('fs/promises')
        const videoBuffer = await readFile(tmpOutput)

        return videoBuffer
    } finally {
        try {
            await unlink(tmpInput)
            await unlink(tmpOutput)
        } catch {
            // 임시 파일 삭제 실패는 무시
        }
    }
}

/**
 * 효과별 FFmpeg 필터 생성
 * 
 * 모든 줌 효과는 정중앙을 기준으로 합니다.
 * x, y 좌표를 중앙으로 설정: x=(iw-iw/zoom)/2, y=(ih-ih/zoom)/2
 */
function getFilterComplex(effect: ImageToVideoOptions['effect'], duration: number): string {
    const frames = duration * 30
    
    switch (effect) {
        case 'zoom_in':
            // 1.0배 → 1.15배 부드러운 줌인 (정중앙 기준)
            return `-vf "scale=1080:1920,zoompan=z='min(1.0+0.001*on,1.15)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frames}:s=1080x1920:fps=30"`

        case 'zoom_out':
            // 1.15배 → 1.0배 부드러운 줌아웃 (정중앙 기준)
            return `-vf "scale=1080:1920,zoompan=z='if(lte(on,1),1.15,max(1.0,1.15-0.001*on))':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frames}:s=1080x1920:fps=30"`

        case 'zoom_fade':
            // 1.0배 → 1.1배 부드러운 줌인 + 페이드 (정중앙 고정)
            return `-vf "scale=1080:1920,zoompan=z='min(1+0.0002*on,1.1)':x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':d=${frames}:s=1080x1920:fps=30,fade=t=in:st=0:d=0.3,fade=t=out:st=${duration - 0.3}:d=0.3"`

        case 'pan_left':
            // 왼쪽으로 천천히 패닝 (1.1배 줌 유지)
            return `-vf "scale=1080:1920,zoompan=z='1.1':x='iw/2-(iw/zoom/2)+on*2':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30"`

        case 'pan_right':
            // 오른쪽으로 천천히 패닝 (1.1배 줌 유지)
            return `-vf "scale=1080:1920,zoompan=z='1.1':x='iw/2-(iw/zoom/2)-on*2':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30"`

        case 'Ken_burns':
            // Ken Burns 효과: 좌상단에서 우하단으로 줌+팬 (영화적)
            return `-vf "scale=1080:1920,zoompan=z='min(1.0+0.0008*on,1.2)':x='iw/zoom*0.3-on*0.5':y='ih/zoom*0.3-on*0.3':d=${frames}:s=1080x1920:fps=30,fade=t=in:st=0:d=0.5,fade=t=out:st=${duration - 0.5}:d=0.5"`

        case 'none':
        default:
            return `-vf "scale=1080:1920,fps=30"`
    }
}

/**
 * 동영상 파일명 생성 (타임스탬프 포함)
 */
export function generateVideoFilename(jobId: string): string {
    const timestamp = Date.now()
    return `shortform-${jobId}-${timestamp}.mp4`
}
