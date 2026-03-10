/**
 * components/admin/UrgentIssueAlert.tsx
 * 
 * 긴급 이슈 알림 배너 (해제 가능)
 * 
 * 조건: 화력 30점 이상 + 연예/정치 카테고리 + 대기 상태
 */

'use client'

import { useEffect, useState } from 'react'

interface UrgentIssueAlertProps {
    urgentCount: number
    onDismiss?: () => void
}

export function UrgentIssueAlert({ urgentCount, onDismiss }: UrgentIssueAlertProps) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        // localStorage에서 마지막 닫은 시각 확인
        const dismissedAt = localStorage.getItem('urgent-alert-dismissed-at')
        
        if (urgentCount === 0) {
            setVisible(false)
            return
        }

        // 닫은 지 1시간 이내면 표시 안 함
        if (dismissedAt) {
            const elapsed = Date.now() - parseInt(dismissedAt, 10)
            if (elapsed < 60 * 60 * 1000) {
                setVisible(false)
                return
            }
        }

        setVisible(true)
    }, [urgentCount])

    const handleDismiss = () => {
        setVisible(false)
        localStorage.setItem('urgent-alert-dismissed-at', Date.now().toString())
        onDismiss?.()
    }

    if (!visible) return null

    return (
        <div className="mb-6 rounded-lg border-2 border-red-500 bg-red-50 p-4 shadow-sm">
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                    <svg 
                        className="h-6 w-6 flex-shrink-0 text-red-600" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={1.5} 
                        stroke="currentColor"
                    >
                        <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" 
                        />
                    </svg>
                    <div>
                        <h3 className="font-semibold text-red-900">
                            🚨 즉시 처리 필요한 이슈 {urgentCount}건
                        </h3>
                        <p className="mt-1 text-sm text-red-700">
                            화력 30점 이상의 연예/정치 이슈가 승인 대기 중입니다.
                        </p>
                        <button
                            onClick={() => {
                                const pendingSection = document.getElementById('pending-issues')
                                pendingSection?.scrollIntoView({ behavior: 'smooth' })
                            }}
                            className="mt-2 text-sm font-medium text-red-800 underline hover:text-red-900"
                        >
                            대기 목록으로 이동 →
                        </button>
                    </div>
                </div>
                <button
                    onClick={handleDismiss}
                    className="flex-shrink-0 rounded-md p-1 text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    aria-label="알림 닫기"
                >
                    <svg 
                        className="h-5 w-5" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={1.5} 
                        stroke="currentColor"
                    >
                        <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            d="M6 18L18 6M6 6l12 12" 
                        />
                    </svg>
                </button>
            </div>
        </div>
    )
}
