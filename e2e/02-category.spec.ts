/**
 * e2e/02-category.spec.ts
 *
 * [카테고리 필터링 E2E 테스트]
 *
 * 카테고리 탭(연예/스포츠/정치/사회/기술) 클릭 시 필터링 작동을 검증합니다.
 */

import { test, expect } from '@playwright/test'

const CATEGORIES = [
    { name: '연예', path: '/entertain' },
    { name: '스포츠', path: '/sports' },
    { name: '정치', path: '/politics' },
    { name: '사회', path: '/society' },
    { name: '기술', path: '/tech' },
]

test.describe('카테고리 필터링', () => {
    for (const cat of CATEGORIES) {
        test(`${cat.name} 카테고리 클릭 시 필터링 작동`, async ({ page }) => {
            await page.goto('/')
            await page.waitForLoadState('networkidle')

            const navLink = page.locator(`a[href="${cat.path}"]`).first()
            await expect(navLink).toBeVisible()
            await navLink.click()

            await expect(page).toHaveURL(cat.path)
            await page.waitForLoadState('networkidle')

            const issueCards = page.locator('a[href^="/issue/"]')
            const count = await issueCards.count()

            if (count > 0) {
                const firstCard = issueCards.first()
                await expect(firstCard.locator('span').filter({ hasText: cat.name })).toBeVisible()
            }
        })
    }
})
