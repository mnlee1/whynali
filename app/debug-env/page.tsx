/**
 * app/debug-env/page.tsx
 * 
 * 환경 변수 디버깅용 임시 페이지
 * 확인 후 삭제해도 됨
 */

export default function DebugEnvPage() {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    const nodeEnv = process.env.NODE_ENV
    
    return (
        <div style={{ padding: '20px', fontFamily: 'monospace' }}>
            <h1>환경 변수 디버그</h1>
            <ul>
                <li>
                    <strong>NEXT_PUBLIC_SITE_URL:</strong>{' '}
                    {siteUrl || '(설정 안 됨)'}
                </li>
                <li>
                    <strong>NODE_ENV:</strong> {nodeEnv}
                </li>
                <li>
                    <strong>현재 페이지 URL:</strong>{' '}
                    <span id="current-url">-</span>
                </li>
            </ul>
            
            <h2>클라이언트 사이드 확인</h2>
            <div id="client-check">로딩 중...</div>
            
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        document.getElementById('current-url').textContent = window.location.origin;
                        document.getElementById('client-check').innerHTML = 
                            '<strong>NEXT_PUBLIC_SITE_URL (클라이언트):</strong> ' + 
                            (process.env.NEXT_PUBLIC_SITE_URL || '(설정 안 됨)');
                    `,
                }}
            />
        </div>
    )
}
