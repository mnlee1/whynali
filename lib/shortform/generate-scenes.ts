/**
 * lib/shortform/generate-scenes.ts
 * 
 * 3개 Scene 이미지 생성 (레퍼런스 스타일)
 */

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'
import { downloadImage } from './fetch-stock-images'

const WIDTH = 1080
const HEIGHT = 1920

const HEAT_COLORS = {
    '높음': { bg: '#FEE2E2', text: '#991B1B' },
    '보통': { bg: '#FEF3C7', text: '#92400E' },
    '낮음': { bg: '#F3F4F6', text: '#374151' },
}

const STATUS_COLORS = {
    '점화': { bg: '#FED7AA', text: '#9A3412' },
    '논란중': { bg: '#FCA5A5', text: '#991B1B' },
    '종결': { bg: '#E5E7EB', text: '#374151' },
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
        const logoBuffer = readFileSync(logoPath)
        return `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch {
        return ''
    }
}

/**
 * 배경 이미지만 생성 (텍스트 없이)
 */
export async function createBackgroundScene(backgroundUrl: string): Promise<Buffer> {
    const bgBuffer = await downloadImage(backgroundUrl)
    
    // 배경 이미지 처리 (밝게 조정)
    const background = await sharp(bgBuffer)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
        .modulate({ brightness: 0.65 })
        .toBuffer()
    
    // 약한 오버레이
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
 * Scene별 텍스트 레이어 생성 (투명 배경)
 * 
 * @param text - Scene에 표시할 자막 텍스트
 * @param sceneNumber - Scene 번호 (1, 2, 3)
 * @param issueUrl - 이슈 URL (Scene 3에서 표시)
 */
export async function createSceneTextOverlay(text: string, sceneNumber: number, issueUrl?: string): Promise<Buffer> {
    const logoBase64 = getLogoBase64()
    
    // 텍스트 줄바꿈 처리 (15자 기준)
    const lines = text.length > 15 ? [
        text.slice(0, 15),
        text.slice(15, 30),
    ] : [text]
    
    // Scene별 다른 레이아웃
    let svgContent = ''
    
    if (sceneNumber === 1) {
        // Scene 1: 로고 + 훅 텍스트 (상단)
        svgContent = `
            ${logoBase64 ? `<image href="${logoBase64}" x="${WIDTH / 2 - 150}" y="300" width="300" height="120" preserveAspectRatio="xMidYMid meet"/>` : ''}
            ${lines.map((line, i) => `
                <text x="${WIDTH / 2}" y="${550 + i * 90}" text-anchor="middle" 
                      font-family="Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif" 
                      font-size="80" font-weight="900" fill="#FFFFFF"
                      stroke="#000000" stroke-width="4">
                    ${escapeXml(line)}
                </text>
            `).join('')}
        `
    } else if (sceneNumber === 2) {
        // Scene 2: 중앙 강조 텍스트
        svgContent = `
            ${lines.map((line, i) => `
                <text x="${WIDTH / 2}" y="${860 + i * 90}" text-anchor="middle" 
                      font-family="Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif" 
                      font-size="76" font-weight="900" fill="#FFFFFF"
                      stroke="#000000" stroke-width="3">
                    ${escapeXml(line)}
                </text>
            `).join('')}
        `
    } else {
        // Scene 3: CTA 버튼 스타일 + URL
        const shortUrl = issueUrl ? issueUrl.replace('https://', '') : ''
        svgContent = `
            ${lines.map((line, i) => `
                <text x="${WIDTH / 2}" y="${720 + i * 90}" text-anchor="middle" 
                      font-family="Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif" 
                      font-size="76" font-weight="900" fill="#FFFFFF"
                      stroke="#000000" stroke-width="3">
                    ${escapeXml(line)}
                </text>
            `).join('')}
            <rect x="${WIDTH / 2 - 350}" y="1000" width="700" height="140" rx="70" fill="#1E40AF"/>
            <text x="${WIDTH / 2}" y="1095" text-anchor="middle" 
                  font-family="Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif" 
                  font-size="56" font-weight="700" fill="#FFFFFF">
                지금 바로 확인하기
            </text>
            ${shortUrl ? `
            <text x="${WIDTH / 2}" y="1180" text-anchor="middle" 
                  font-family="Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif" 
                  font-size="32" font-weight="500" fill="#E5E7EB">
                왜난리에서 실시간 여론·토론·타임라인 확인
            </text>
            <text x="${WIDTH / 2}" y="1230" text-anchor="middle" 
                  font-family="Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif" 
                  font-size="28" font-weight="500" fill="#93C5FD">
                ${escapeXml(shortUrl)}
            </text>
            ` : ''}
        `
    }
    
    const svg = `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            ${svgContent}
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
 * 텍스트 레이어 생성 (투명 배경) - 레거시
 * @deprecated createSceneTextOverlay 사용 권장
 */
export async function createTextOverlay(title: string): Promise<Buffer> {
    return createSceneTextOverlay(title, 1)
}

/**
 * Scene 1, 2, 3: 배경 이미지만 반환
 */
export async function createScene1(backgroundUrl: string, catchphrase: string): Promise<Buffer> {
    return createBackgroundScene(backgroundUrl)
}

export async function createScene2(backgroundUrl: string, title: string, status: string, heatGrade: string): Promise<Buffer> {
    return createBackgroundScene(backgroundUrl)
}

export async function createScene3(backgroundUrl: string): Promise<Buffer> {
    return createBackgroundScene(backgroundUrl)
}
