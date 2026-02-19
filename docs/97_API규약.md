# API 규약·공통 타입

1단계 기초 픽스 때 **API 주소·요청/응답 형태**를 문서로 고정하기로 한 산출물이다(98_로드맵 §1단계, 97_1단계_기초픽스 §4). 클라이언트·서버 구현 시 이 규약을 따른다.

**관련 문서**
- [97_1단계_기초픽스.md](./97_1단계_기초픽스.md) — 1단계 픽스 항목·스키마·담당. API 규약 요약 포함.
- [98_로드맵.md](./98_로드맵.md) — 2주 일정·Day별 작업. 1단계에서 API 규약 문서 고정.
- [07_이슈등록_화력_정렬_규격.md](./07_이슈등록_화력_정렬_규격.md) — 목록 정렬(sort·쿼리), 댓글 정렬(sort) 규칙. API 쿼리와 연동.
- [02_AI기획_판단포인트.md](./02_AI기획_판단포인트.md) — 수치·권한·화력 노출 정책.

---

## 공통

- REST. JSON 요청/응답.
- 인증 필요 API: `Authorization: Bearer <Supabase JWT>`.
- 에러: `{ "error": "코드", "message": "설명" }`, HTTP 4xx/5xx.

---

## 이슈

### 목록

- `GET /api/issues`
- Query: `category`, `status`, `q`(키워드), `sort`(latest|heat), `limit`, `offset`
- 응답:

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "string",
      "description": "string",
      "status": "점화|논란중|종결",
      "category": "연예|스포츠|정치|사회|기술",
      "heat_index": 0,
      "created_at": "ISO8601"
    }
  ],
  "total": 0
}
```

### 상세

- `GET /api/issues/[id]`
- 응답: 목록 항목 필드 + (선택) 타임라인 개수, 댓글 수, 감정 집계 요약.

### 타임라인

- `GET /api/issues/[id]/timeline`
- 응답: `{ "data": [ { "id", "occurred_at", "source_url", "stage" } ] }`

### 출처 목록

- `GET /api/issues/[id]/sources`
- 응답: 뉴스·커뮤니티 수집 데이터 목록(제목, 링크, 출처, 날짜 등).

---

## 댓글

- `GET /api/issues/[id]/comments` 또는 `GET /api/discussion-topics/[id]/comments`
- Query: `sort`(latest|likes|dislikes), `limit`, `offset`
- 응답: `{ "data": [ { "id", "body", "user_id", "like_count", "dislike_count", "created_at" } ] }`
- `POST` 댓글: body `{ "body": "string" }`. 세이프티봇 적용 후 visibility 반영.

---

## 투표

- `GET /api/issues/[id]/votes` → 투표 목록 + 선택지별 득표.
- `POST /api/issues/[id]/votes/[voteId]` body `{ "vote_choice_id": "uuid" }` (로그인 필수).

---

## 토론 주제

- `GET /api/discussion-topics` Query: `issue_id`, `q`, `limit`, `offset`
- `GET /api/discussion-topics/[id]` 상세
- 목록/상세 응답: `{ "id", "issue_id", "body", "approval_status", "created_at" }` (승인된 것만 공개)

---

## 글로벌 검색

- `GET /api/search?q=키워드&type=all|issues|discussion_topics&limit=`
- 응답: `{ "issues": [ ... ], "discussion_topics": [ ... ] }`
