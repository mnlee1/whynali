/**
 * e2e/08-navigation.spec.ts
 *
 * [네비게이션 E2E 테스트]
 *
 * 헤더 메뉴, 로고, 링크 작동을 검증합니다.
 */

import { test, expect } from '@playwright/test'

test.describe('네비게이션', () => {
    test('헤더 메뉴 작동 확인', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const logo = page.locator('a[href="/"]').first()
        await expect(logo).toBeVisible()
        await logo.click()
        await expect(page).toHaveURL('/')
    })

    test('카테고리 네비게이션 링크 확인', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const links = ['/entertain', '/sports', '/politics', '/society', '/tech', '/community']
        for (const href of links) {
            const link = page.locator(`a[href="${href}"]`).first()
            await expect(link).toBeVisible()
        }
    })

    test('모바일 뷰포트에서 GNB 표시', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const mobileNav = page.locator('a[href="/entertain"], a[href="/community"]').first()
        await expect(mobileNav).toBeVisible()
    })
})
