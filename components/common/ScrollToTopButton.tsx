'use client'

import { useEffect, useState } from 'react'

export default function ScrollToTopButton() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 300)
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    if (!visible) return null

    return (
        <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="맨 위로"
            className="fixed bottom-6 right-4 md:bottom-8 md:right-8 z-50
                       w-10 h-10 rounded-full
                       bg-surface border border-border shadow-lg
                       flex items-center justify-center
                       text-content-secondary hover:text-primary hover:border-primary
                       transition-colors duration-150"
        >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 12V4M4 8l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    )
}
