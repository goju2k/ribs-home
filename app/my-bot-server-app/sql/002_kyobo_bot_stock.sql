-- 이 저장소엔 마이그레이션 도구가 없음. ribs 스키마 Postgres에 수동 1회 실행 필요.
--
-- 교보/영풍 재고 체크 봇(kyobo-bot/kyobo.ts)이 매 체크마다 스냅샷을 쌓는 테이블.
-- book_key로 책을 구분해두어(현재는 한 권만 추적 중이지만) 추후 대상 책이 늘어나도
-- 같은 테이블을 그대로 재사용할 수 있다. 프로세스 재시작(재배포 등) 시 마지막 값을
-- 잃지 않도록, 봇은 시작 시 book_key/gb/str_name별 가장 최근 행을 읽어 prev를 채운다.
CREATE TABLE IF NOT EXISTS ribs.kyobo_bot_stock (
  id          bigserial    PRIMARY KEY,
  book_key    varchar(50)  NOT NULL,   -- 봇 코드의 BOOK_TARGETS[].key와 동일한 값
  gb          varchar(1)   NOT NULL,   -- '1'=교보문고, '2'=영풍문고
  str_name    varchar(100) NOT NULL,   -- 지점명
  quantity    integer      NOT NULL,   -- 실재고수량(realInvnQntt / labst)
  checked_at  timestamptz  NOT NULL DEFAULT now()
);

-- book_key+gb+str_name별 "가장 최근 값" 조회(DISTINCT ON, 프로세스 재시작 시 prev 복원용)를
-- 위한 인덱스.
CREATE INDEX IF NOT EXISTS idx_kyobo_bot_stock_latest
  ON ribs.kyobo_bot_stock (book_key, gb, str_name, checked_at DESC);
