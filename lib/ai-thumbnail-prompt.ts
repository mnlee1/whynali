/**
 * lib/ai-thumbnail-prompt.ts
 * AI 썸네일 프롬프트 생성 공유 유틸리티 (Vertex AI / Gemini API 공용)
 */

export const CATEGORY_STYLE: Record<string, string> = {
    '연예': 'neon stage bokeh, cinematic lighting, vibrant colors',
    '스포츠': 'stadium aerial view, dramatic lighting, motion blur',
    '정치': 'marble architecture, dramatic shadows, monumental',
    '사회': 'urban street blur, atmospheric haze, dramatic sky',
    '경제': 'glass skyscrapers, financial district, golden hour',
    '기술': 'circuit board macro, blue digital glow, futuristic',
    '세계': 'aerial earth view, dramatic clouds, wide horizon',
    '생활문화': 'warm cafe interior, soft bokeh, lifestyle aesthetic',
    'IT과학': 'circuit board macro, blue digital glow, futuristic',
}

export async function buildThumbnailPrompt(title: string, category: string): Promise<string> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    const style = CATEGORY_STYLE[category] ?? 'dramatic atmosphere, cinematic'

    if (apiKey) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: [{
                        role: 'user',
                        content: `Create a short English image generation prompt for a Korean news thumbnail.
Rules: atmospheric/abstract background only, NO people faces, NO text, NO logos.
Style: ${style}
Korean headline: "${title}"
Reply with ONLY the prompt (under 30 words), nothing else.`,
                    }],
                    max_tokens: 60,
                    temperature: 0.3,
                }),
            })
            if (res.ok) {
                const data = await res.json()
                const prompt = data.choices?.[0]?.message?.content?.trim()
                if (prompt) return `${prompt}, ${style}, 16:9 widescreen landscape, no people, no text, high quality`
            }
        } catch {
            // Groq 실패 시 카테고리 스타일만 사용
        }
    }

    return `${style}, abstract atmospheric background, 16:9 widescreen landscape, no people, no text, high quality`
}
