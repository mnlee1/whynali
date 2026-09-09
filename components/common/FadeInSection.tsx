/**
 * components/common/FadeInSection.tsx
 *
 * 섹션이 뷰포트에 처음 들어올 때 아래에서 위로 페이드인하는 스크롤 등장 효과 래퍼.
 * 새로고침 후 스크롤할 때도 매번 각 섹션 진입 시점에 재생된다 (viewport once: true로 섹션당 1회).
 */

'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
    children: ReactNode
    delay?: number
}

export default function FadeInSection({ children, delay = 0 }: Props) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay }}
        >
            {children}
        </motion.div>
    )
}
