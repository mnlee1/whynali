# 백업 폴더

이 폴더에는 자동으로 생성된 DB 백업 파일이 저장됩니다.
매일 새벽 3시에 GitHub Actions가 자동으로 백업을 수행합니다.

## 구조

```
backups/
  2026-04-09/
    issues.json
    users.json
    comments.json
    reactions.json
    votes.json
    news_data.json
    _meta.json
  2026-04-10/
    ...
```

## 복원 방법

```bash
# 전체 복원
node scripts/restore-db.mjs 2026-04-09

# 특정 테이블만 복원
node scripts/restore-db.mjs 2026-04-09 issues
```

## 보관 기간

최근 7일간의 백업만 유지됩니다.

