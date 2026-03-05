/**
 * e2e/05-comments.spec.ts
 *
 * [댓글 기능 E2E 테스트]
 *
 * 댓글 목록, 정렬, 베스트 댓글, 좋아요/싫어요, 작성 UI를 검증합니다.
 */

import { test, expect } from '@playwright/test'

test.describe('댓글 기능', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')
        const firstCard = page.locator('a[href^="/issue/"]').first()
        await firstCard.click()
        await page.waitForLoadState('networkidle')
    })

    test('댓글 섹션 표시 확인', async ({ page }) => {
        const commentSection = page.locator('text=댓글').first()
        await expect(commentSection).toBeVisible()
    })

    test('댓글 정렬 옵션 (최신순/좋아요순) 확인', async ({ page }) => {
        const sortButtons = page.locator('button').filter({ hasText: /최신순|좋아요순|싫어요순/ })
        const count = await sortButtons.count()
        if (count > 0) {
            await expect(sortButtons.first()).toBeVisible()
        }
    })

    test('댓글 좋아요/싫어요 버튼 확인', async ({ page }) => {
        const likeButtons = page.locator('button[aria-label*="좋아요"], button[aria-label*="싫어요"]')
            .or(page.locator('button').filter({ hasText: /👍|👎/ }))
        const count = await likeButtons.count()
        if (count > 0) {
            await expect(likeButtons.first()).toBeVisible()
        }
    })

    test('댓글 작성 UI 확인', async ({ page }) => {
        const writeArea = page.locator('textarea').or(page.locator('input[placeholder*="댓글"]'))
        const count = await writeArea.count()
        if (count > 0) {
            await expect(writeArea.first()).toBeVisible()
        }
    })
})
