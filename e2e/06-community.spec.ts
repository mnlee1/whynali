/**
 * e2e/06-community.spec.ts
 *
 * [커뮤니티 E2E 테스트]
 *
 * 커뮤니티 메뉴 접근, 토론 주제 목록, 상세 확인을 검증합니다.
 */

import { test, expect } from '@playwright/test'

test.describe('커뮤니티', () => {
    test('커뮤니티 메뉴 접근 확인', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const communityLink = page.locator('a[href="/community"]').first()
        await expect(communityLink).toBeVisible()
        await communityLink.click()

        await expect(page).toHaveURL('/community')
    })

    test('토론 주제 목록 표시 확인', async ({ page }) => {
        await page.goto('/community')
        await page.waitForLoadState('networkidle')

        const hasTopics = await page.locator('a[href^="/community/"]').count() > 0
        const hasEmpty = await page.locator('text=토론 주제가 없습니다').or(page.locator('text=결과가 없습니다')).isVisible().catch(() => false)
        expect(hasTopics || hasEmpty).toBeTruthy()
    })

    test('토론 주제 상세 확인 (주제가 있는 경우)', async ({ page }) => {
        await page.goto('/community')
        await page.waitForLoadState('networkidle')

        const firstTopic = page.locator('a[href^="/community/"]').first()
        const count = await firstTopic.count()
        if (count > 0) {
            await firstTopic.click()
            await expect(page).toHaveURL(/\/community\/[^/]+$/)
        }
    })
})
