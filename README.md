# Team ARIA

애니메이션 주제가를 한국어로 더빙·개사해 나누는 팬 커뮤니티. Next.js 16 + Supabase.

## 구조

```
src/
  app/                 화면 (홈, 게시판 /b/[slug] …)
  components/          헤더·푸터
  lib/
    boards.ts          게시판 메뉴·등급 구조 (0001_init.sql 의 기본 게시판과 같아야 함)
    data.ts            Supabase 에서 글을 읽는 곳 (연결 전에는 예시 글)
    sanitize.ts        글 본문(HTML) 정화 — 화면에 그리기 전에 반드시 거친다
supabase/
  migrations/0001_init.sql   테이블·권한(RLS)·포인트·기본 게시판
  tests/schema.mjs           스키마·권한 시험 (npm run test:db)
scripts/
  import-xe.mjs        기존 XE 사이트 데이터 이전 도구
```

## 처음 설정

1. Supabase 프로젝트를 만든다
2. SQL Editor 에서 `supabase/migrations/0001_init.sql` 전체를 실행한다
3. Storage 에서 **private** 버킷 `attachments` 를 만든다 (첨부파일용. 공개 버킷으로 만들지 않는다)
4. `.env.example` 을 `.env.local` 로 복사하고 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 채운다
5. `npm run dev`

## 설계 규칙

- **권한은 DB 가 강제한다.** 게시판마다 읽기·쓰기·댓글 등급이 있고 RLS 로 막는다. 화면에서 버튼을 숨기는 것은 편의일 뿐이다.
- **포인트·등급은 사용자가 직접 못 바꾼다.** `apply_points()` 같은 서버 함수로만 바뀌고, 같은 사유(예: 같은 날 출석)는 한 번만 지급된다.
- **글 본문은 HTML 이므로 `cleanHtml()` 을 거쳐 그린다.** 기존 XE 글에 스크립트가 섞여 있어도 막힌다.
- 기존 데이터에는 `legacy_*` 번호가 붙어 있어 이전을 여러 번 해도 중복되지 않는다.

## 기존 사이트 데이터 이전

두 가지 방법이 있다. 지금은 **홈페이지 수집(A)** 을 쓴다.

| | A. 홈페이지 수집 (운영자 허락 필요) | B. XE DB 덤프 |
|---|---|---|
| 공개 게시판 글·댓글·대댓글·제작진 표 | 가능 | 가능 |
| 회원 전용 게시판(질문/건의, 자료실, 합작 …) | **불가** (로그인하지 않음) | 가능 |
| 회원·포인트 | 불가 (글쓴이 이름만 남음) | 가능 (비밀번호 제외) |
| 첨부파일·작품 음원 | 불가 (회원 전용 다운로드), 주소만 기록 | 폴더째 복사 |

### A. 홈페이지 수집 (`scripts/crawl-aria.mjs` → `scripts/load-crawl.mjs`)

수집과 DB 입력을 나눠 두었다. 수집은 파일(`import/crawl/`, Git 제외)에만 쓰므로 DB 를 건드리지 않는다.

1. Supabase 에서 `supabase/migrations/` 의 SQL 을 번호 순서대로 모두 실행한다 (0001, 0002)
2. 소량 시험: `npm run crawl -- --boards=free --max-pages=1 --limit-docs=3`
3. 목록만 모아 글 수·예상 시간 확인: `npm run crawl -- --index-only`
4. 전체 수집 (**글 약 1.8만 개 → 15시간 이상**). 언제든 Ctrl+C 로 멈추고 같은 명령으로 이어서 한다: `npm run crawl`
5. DB 에 넣기 — 시험(쓰지 않음): `npm run load:crawl` / 실제: `npm run load:crawl -- --run` (여러 번 해도 중복되지 않음)

지키는 것: 요청 사이 **3초**(robots.txt Crawl-delay), 로그인하지 않음, 403 을 만나면 우회하지 않고 멈춤. 요청에 `TeamAriaMigration` 이라고 밝힌다.

회원 전용으로 건너뛰는 게시판: 질문/건의, 자료실, 라디오, 승급 신청, 합작. (출석부는 화면 구조를 못 읽어 제외 — 필요하면 구조를 보고 추가)

수집한 글에서 가져오는 것: 제목·본문 HTML·글쓴이 이름과 기존 번호·날짜·조회수·분류·해시태그·**제작진 표(노래/녹음/믹싱/가사/번역/공개일)**·댓글과 대댓글. 본문 이미지는 기존 사이트 주소(team-aria.net)를 그대로 가리키므로, 기존 서버를 끄기 전에 새 저장소로 옮겨야 한다.

### B. XE DB 덤프 (`scripts/import-xe.mjs`)

덤프를 `import/dump/` 에 넣고 `npm run import:db:up` (Docker 임시 MariaDB) → `.env.local` 에 `SUPABASE_*` → 시험 `node scripts/import-xe.mjs` → 실제 `--run`. 회원 비밀번호는 옮기지 않는다 (XE 해시 방식이 달라, 회원은 ‘비밀번호 찾기’로 다시 설정). 실제 덤프로는 아직 시험하지 못했다.

## 시험

```bash
npm run test:db      # 스키마·권한·수집 데이터 입력 35개 항목 (메모리 Postgres, 설치 불필요)
npm run build
```

## 다음 할 일

- 로그인·회원가입 (Supabase Auth, 닉네임)
- 게시판 글 목록·글 보기·글쓰기·댓글
- 첨부 다운로드 (서버가 포인트를 확인한 뒤 서명 URL 발급)
- 출석·퀴즈 등 포인트 기능, 관리자 화면
