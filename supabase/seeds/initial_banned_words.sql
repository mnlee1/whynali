-- 한국어 온라인 커뮤니티 기본 금칙어 초기 데이터
-- 최초 1회 실행 (Supabase SQL Editor에서 실행)
-- safety_rules 테이블에 kind='banned_word' 로 삽입

INSERT INTO safety_rules (kind, value) VALUES

-- ──────────────────────────────────────────────
-- 1. 강한 욕설 (Strong Profanity)
-- ──────────────────────────────────────────────
('banned_word', '씨발'),
('banned_word', '씨팔'),
('banned_word', '시발'),
('banned_word', '시팔'),
('banned_word', '씨바'),
('banned_word', '시바'),
('banned_word', '씨빨'),
('banned_word', '시빨'),
('banned_word', '개새끼'),
('banned_word', '개세끼'),
('banned_word', '개쉐이'),
('banned_word', '개씨발'),
('banned_word', '개시발'),
('banned_word', '미친새끼'),
('banned_word', '미친놈'),
('banned_word', '미친년'),
('banned_word', '미친색끼'),
('banned_word', '존나'),
('banned_word', '존내'),
('banned_word', '졸라'),
('banned_word', '존맛'),
('banned_word', '개같은'),
('banned_word', '개같이'),
('banned_word', '지랄'),
('banned_word', '지럴'),
('banned_word', '개지랄'),
('banned_word', '병신'),
('banned_word', '병쉰'),
('banned_word', 'ㅂㅅ'),
('banned_word', 'ㅆㅂ'),
('banned_word', '썅'),
('banned_word', '썅놈'),
('banned_word', '꺼져'),
('banned_word', '뒤져'),
('banned_word', '뒤지'),
('banned_word', '뒤지게'),
('banned_word', '쳐죽'),
('banned_word', '죽어버'),
('banned_word', '죽어라'),
('banned_word', '닥쳐'),
('banned_word', '꺼지라'),
('banned_word', '느그'),
('banned_word', '니기미'),
('banned_word', '니미럴'),
('banned_word', '니애미'),
('banned_word', '애미'),
('banned_word', '애비'),
('banned_word', '어미'),
('banned_word', '니어미'),
('banned_word', '엠창'),
('banned_word', '창년'),
('banned_word', '창녀'),

-- ──────────────────────────────────────────────
-- 2. 성적 표현 (Sexual Expressions)
-- ──────────────────────────────────────────────
('banned_word', '보지'),
('banned_word', '보짓'),
('banned_word', '보짜'),
('banned_word', '자지'),
('banned_word', '자짓'),
('banned_word', '좆'),
('banned_word', '좆같'),
('banned_word', '좆까'),
('banned_word', '자위'),
('banned_word', '섹스'),
('banned_word', '섹파'),
('banned_word', '야동'),
('banned_word', '야설'),
('banned_word', '포르노'),
('banned_word', '강간'),
('banned_word', '강간범'),
('banned_word', '성폭행'),
('banned_word', '성추행'),
('banned_word', '음란'),
('banned_word', '노출'),

-- ──────────────────────────────────────────────
-- 3. 비하·혐오 표현 (Hate/Derogatory Expressions)
-- ──────────────────────────────────────────────
('banned_word', '찐따'),
('banned_word', '장애인새끼'),
('banned_word', '정신병자'),
('banned_word', '미치광이'),
('banned_word', '빈촌'),
('banned_word', '거지새끼'),
('banned_word', '루저'),
('banned_word', '패배자새끼'),

-- ──────────────────────────────────────────────
-- 4. 인종·민족 비하 (Racial/Ethnic Slurs)
-- ──────────────────────────────────────────────
('banned_word', '쪽발이'),
('banned_word', '짱깨'),
('banned_word', '짱개'),
('banned_word', '검둥이'),
('banned_word', '흑인놈'),
('banned_word', '튀기'),
('banned_word', '오랑캐'),

-- ──────────────────────────────────────────────
-- 5. 정치·이념 혐오 표현 (Political Hate Expressions)
-- ──────────────────────────────────────────────
('banned_word', '빨갱이'),
('banned_word', '종북'),
('banned_word', '토왜'),
('banned_word', '친일파새끼'),

-- ──────────────────────────────────────────────
-- 6. 성별 비하 표현 (Gender-based Slurs)
-- ──────────────────────────────────────────────
('banned_word', '김치녀'),
('banned_word', '김치년'),
('banned_word', '된장녀'),
('banned_word', '보슬아치'),
('banned_word', '한남충'),
('banned_word', '틀딱'),
('banned_word', '노인네'),
('banned_word', '할배'),
('banned_word', '할망구'),

-- ──────────────────────────────────────────────
-- 7. 스팸·광고·유도 표현 (Spam/Ad Keywords)
-- ──────────────────────────────────────────────
('banned_word', '카톡추가'),
('banned_word', '텔레그램'),
('banned_word', '카카오톡추가'),
('banned_word', '라인추가'),
('banned_word', '오픈채팅'),
('banned_word', '대출상담'),
('banned_word', '불법도박'),
('banned_word', '도박사이트'),
('banned_word', '토토사이트'),
('banned_word', '불법총기'),
('banned_word', '마약'),
('banned_word', '히로뽕'),
('banned_word', '필로폰'),
('banned_word', '대마초'),
('banned_word', '클릭해주세요'),
('banned_word', '방문해주세요'),
('banned_word', '무료쿠폰'),
('banned_word', '돈버는방법'),
('banned_word', '부업알바')

ON CONFLICT DO NOTHING;

-- 삽입 결과 확인
SELECT kind, COUNT(*) AS cnt
FROM safety_rules
GROUP BY kind
ORDER BY kind;
