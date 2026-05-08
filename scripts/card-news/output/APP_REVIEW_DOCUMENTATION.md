ㅇ# Instagram API Usage Documentation for App Review

## Application Purpose

WhyNali (whynali.com) is a Korean trending issues tracking service that automatically generates and publishes weekly card news to Instagram.

## How the Instagram API is Used

### 1. Automated Card News Generation

**Schedule:** Twice per week (Wednesday and Saturday at 9 AM KST)

**Process:**
1. Fetch top 3 trending issues from database
2. Generate card news text using AI
3. Render 5 slides (1080x1350px) as PNG images
4. Upload to Instagram as carousel post using Instagram Graph API

### 2. API Calls

**Endpoint Used:** `/{instagram-user-id}/media`

**Parameters:**
- `media_type`: CAROUSEL
- `children`: Array of image container IDs
- `caption`: Card news summary text
- `access_token`: Long-lived access token

### 3. Content Type

**Format:** Carousel post with 5 slides
- Slide 1: Cover (Top 3 trending issues)
- Slides 2-4: Issue details with summaries
- Slide 5: Call-to-action (Follow prompt)

**Size:** 1080x1350px per image
**Text:** Korean language, public trending issues information
**Links:** whynali.com

## Sample Output

Generated card news images are located in:
`/Users/nhn/Documents/pub/@react/whynali/scripts/card-news/output/`

Files:
- slide-01.png (1.1MB) - Cover slide
- slide-02.png (1.1MB) - Issue 1 with badge
- slide-03.png (1.9MB) - Issue 2 details
- slide-04.png (1.2MB) - Issue 3 details
- slide-05.png (78KB) - Follow CTA

## Terminal Execution Output

```
🚀 카드뉴스 파이프라인 시작
✅ 이슈 3개 조회 완료
✅ 슬라이드 콘텐츠 5개 생성 완료
   slide-1 저장됨
   slide-2 저장됨
   slide-3 저장됨
   slide-4 저장됨
   slide-5 저장됨
✅ 이미지 5장 생성 완료
   저장 경로: /Users/nhn/Documents/pub/@react/whynali/scripts/card-news/output
```

## Permissions Required

- `instagram_basic`: Access to Instagram account information
- `instagram_content_publish`: Publish carousel posts to Instagram

## Privacy & Data Usage

- Content: Publicly available trending issues information only
- No personal data collection
- No sensitive content
- Public service for informational purposes

## Contact

For questions about this implementation, please contact the app administrator through Meta for Developers.
