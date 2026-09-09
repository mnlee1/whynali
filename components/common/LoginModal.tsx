/**
 * components/common/LoginModal.tsx
 *
 * 헤더 "난리에 참여하기" 버튼 전용 로그인 오버레이 모달.
 * 현재 페이지 위에 뜨며, 소셜 로그인 클릭 시 실제 OAuth 리다이렉트(/auth/{provider})로
 * 페이지 이동이 일어나므로 모달 자체는 별도 로그인 성공 처리를 하지 않는다.
 * lib/loginModalStore.ts를 통해 어디서든 openLoginModal()로 열 수 있다.
 */

'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { subscribeLoginModal, closeLoginModal } from '@/lib/loginModalStore'
import LoginOptions from './LoginOptions'

export default function LoginModal() {
    const [mounted, setMounted] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const [next, setNext] = useState('/')

    useEffect(() => {
        setMounted(true)
        return subscribeLoginModal((state) => {
            setIsOpen(state.isOpen)
            setNext(state.next)
        })
    }, [])

    useEffect(() => {
        if (!isOpen) return
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    if (!mounted || !isOpen) return null

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={closeLoginModal}
        >
            <div
                className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-[600px] px-8 py-10 sm:px-12"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={closeLoginModal}
                    aria-label="닫기"
                    className="absolute top-4 right-4 text-content-muted hover:text-content-primary transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
                <LoginOptions next={next} />
            </div>
        </div>,
        document.body
    )
}
