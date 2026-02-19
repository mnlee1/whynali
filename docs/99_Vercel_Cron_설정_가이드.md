# Vercel Cron 무료 플랜 제한 및 권장 설정

## 문제점

현재 설정된 Cron 스케줄이 Vercel 무료 플랜(Hobby) 한도를 초과합니다.

### 무료 플랜 제한
- **1일 100회 실행 제한**

### 현재 설정 (총 960회/일)
- 뉴스 수집(30분): 48회/일
- 커뮤니티(3분): 480회/일 ❌
- 자동연결(5분): 288회/일 ❌
- 화력분석(10분): 144회/일 ❌

## 권장 설정 (총 84회/일)

```json
{
    "framework": "nextjs",
    "crons": [
        {
            "path": "/api/cron/collect-news",
            "schedule": "0 */1 * * *"
        },
        {
            "path": "/api/cron/collect-community",
            "schedule": "*/30 * * * *"
        },
        {
            "path": "/api/cron/auto-link",
            "schedule": "15,45 * * * *"
        },
        {
            "path": "/api/cron/recalculate-heat",
            "schedule": "10,40 * * * *"
        }
    ]
}
```

### 권장 설정 상세

| Cron | 현재 주기 | 권장 주기 | 현재 횟수 | 권장 횟수 |
|------|----------|----------|----------|----------|
| 뉴스 수집 | 30분 | **1시간** | 48회 | **24회** |
| 커뮤니티 | 3분 | **30분** | 480회 | **48회** |
| 자동 연결 | 5분 | **30분** (15분, 45분) | 288회 | **48회** |
| 화력 분석 | 10분 | **30분** (10분, 40분) | 144회 | **48회** |
| **합계** | - | - | **960회** | **168회** |

## 대안 1: 개발/테스트 단계 설정 (총 48회/일)

```json
{
    "crons": [
        {
            "path": "/api/cron/collect-news",
            "schedule": "0 */2 * * *"
        },
        {
            "path": "/api/cron/collect-community",
            "schedule": "0 * * * *"
        },
        {
            "path": "/api/cron/auto-link",
            "schedule": "15 * * * *"
        },
        {
            "path": "/api/cron/recalculate-heat",
            "schedule": "30 * * * *"
        }
    ]
}
```

- 뉴스: 2시간마다 (12회/일)
- 커뮤니티: 1시간마다 정각 (24회/일)
- 자동연결: 1시간마다 15분 (24회/일)
- 화력분석: 1시간마다 30분 (24회/일)
- **합계: 84회/일** ✅

## 대안 2: Pro 플랜 업그레이드

- **월 $20**
- **1일 1,000회 실행**
- 현재 설정(960회/일) 사용 가능

## 대안 3: 외부 Cron 서비스

무료 대안:
- **Cron-job.org**: 무료, 무제한
- **EasyCron**: 무료 플랜 80회/일
- **GitHub Actions**: 무료, 월 2,000분

설정 예시 (GitHub Actions):
```yaml
# .github/workflows/cron-news.yml
name: Collect News
on:
  schedule:
    - cron: '0 * * * *'  # 1시간마다
jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - name: Call API
        run: |
          curl -X GET https://your-app.vercel.app/api/cron/collect-news \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## 권장 사항

1. **개발 중**: 대안 1 (2시간 주기) 사용
2. **운영 시**: Pro 플랜 업그레이드 또는 GitHub Actions 조합
3. **최종**: 사용자 트래픽 분석 후 주기 최적화
