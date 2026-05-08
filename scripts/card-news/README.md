# 카드뉴스 자동화 파이프라인

왜난리의 주간 핫이슈를 Instagram, Threads, X(Twitter)에 자동으로 업로드하는 파이프라인입니다.

## 빠른 시작

### 이미지 생성 테스트

```bash
npx tsx scripts/card-news/pipeline.ts
```

### 실제 SNS 업로드

```bash
npx tsx scripts/card-news/pipeline.ts --publish
```

## 상세 문서

모든 설정 가이드 및 사용법은 `docs/` 폴더를 참고하세요:

- **87_카드뉴스_파이프라인_사용_가이드.md** - 전체 사용 가이드
- **88_Meta_앱_설정_가이드.md** - Instagram/Threads API 설정
- **86_SNS_마케팅_완벽_가이드.md** - 전체 마케팅 전략

## 파일 구조

```
scripts/card-news/
├── pipeline.ts              # 메인 스크립트
├── templates/               # HTML 템플릿
│   ├── slide-01-cover.html
│   ├── slide-02-body.html
│   ├── slide-03-badge.html
│   └── slide-04-follow.html
├── output/                  # 생성된 이미지
└── check-storage.ts         # Supabase Storage 확인 스크립트
```

## GitHub Actions

`.github/workflows/card-news.yml`에서 자동 실행 설정을 확인하세요.

- 매주 수요일/토요일 오전 9시 자동 실행
- 수동 실행 지원
