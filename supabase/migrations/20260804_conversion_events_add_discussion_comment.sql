-- 토론 의견(discussion_comment)을 이슈 댓글(comment)과 분리해서 채널별로 체크할 수 있도록
-- conversion_events.event_type 허용값에 'discussion_comment' 추가

ALTER TABLE conversion_events
    DROP CONSTRAINT IF EXISTS conversion_events_check_type;

ALTER TABLE conversion_events
    ADD CONSTRAINT conversion_events_check_type
    CHECK (event_type IN ('signup', 'vote', 'comment', 'reaction', 'discussion_comment'));
