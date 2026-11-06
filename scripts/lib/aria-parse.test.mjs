// 파서 시험: 실제 페이지에서 저장한 HTML 로 확인한다. 실행: node scripts/lib/aria-parse.test.mjs <목록.html> <글.html> <글번호>
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseDate, parseDoc, parseList, sizeToBytes, srlFromHref } from './aria-parse.mjs';

const [listFile, docFile, srlArg, richFile, richSrl] = process.argv.slice(2);
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('✓', name); } catch (e) { console.log('✗', name, '→', e.message.split('\n')[0]); process.exitCode = 1; } };

t('날짜 파싱 (한국 시간)', () => assert.equal(parseDate('2024.11.28. 11:00'), '2024-11-28T02:00:00.000Z'));
t('날짜 파싱 (시각 없음)', () => assert.equal(parseDate('2021.03.13.'), '2021-03-13T03:00:00.000Z'));
t('날짜 파싱 (쓸 수 없는 값은 null)', () => assert.equal(parseDate('어제'), null));
t('글 번호: 여러 주소 형식', () => {
  assert.equal(srlFromHref('http://team-aria.net/index.php?mid=free&page=1&document_srl=1168756'), '1168756');
  assert.equal(srlFromHref('http://team-aria.net/free/476644'), '476644');
  assert.equal(srlFromHref('http://team-aria.net/free/476644#comment'), '476644');
  assert.equal(srlFromHref('/everybody/897029'), '897029');
  assert.equal(srlFromHref('#popup_menu_area'), null);
});

t('용량 문자열 → 바이트', () => { assert.equal(sizeToBytes('568.8KB'), 582451); assert.equal(sizeToBytes('7.65MB'), 8021606); assert.equal(sizeToBytes('x'), null); });

if (listFile) {
  const list = parseList(readFileSync(listFile, 'utf8'));
  t(`목록: 글 ${list.rows.length}개를 읽음`, () => assert.ok(list.rows.length >= 10));
  t('목록: 모든 행에 글 번호·제목', () => assert.ok(list.rows.every((r) => r.srl > 0 && r.title.length > 0)));
  t('목록: 공지 행을 구분', () => assert.ok(list.rows.some((r) => r.isNotice) && list.rows.some((r) => !r.isNotice)));
  t('목록: 글쓴이 이름에 등급 아이콘 글자가 섞이지 않음', () => assert.ok(list.rows.every((r) => !/회원|alt=/.test(r.author) || r.author.length < 20)));
  t('목록: 글쓴이 번호(member_N)를 읽음', () => assert.ok(list.rows.some((r) => r.authorSrl)));
  t('목록: 댓글 수·조회 수', () => assert.ok(list.rows.some((r) => r.commentCount > 0) && list.rows.some((r) => r.readCount > 0)));
  t(`목록: 마지막 페이지 번호 (${list.lastPage})`, () => assert.ok(list.lastPage >= 1));
  console.log('   예:', JSON.stringify(list.rows.find((r) => !r.isNotice)));
}

if (docFile) {
  const doc = parseDoc(readFileSync(docFile, 'utf8'), { srl: srlArg });
  t('글: 읽기 성공', () => assert.equal(doc.ok, true));
  t('글: 제목·글쓴이·날짜', () => { assert.ok(doc.title); assert.ok(doc.author); assert.ok(doc.date); });
  t('글: 본문이 있고 확장 프로그램 문구는 제거됨', () => { assert.ok(doc.html.length > 0); assert.ok(!/Skipping ads/.test(doc.html)); });
  t('글: 조회 수', () => assert.ok(doc.readCount > 0));
  t('글: 댓글을 읽음', () => assert.ok(doc.comments.length >= 1 && doc.comments.every((c) => c.srl && c.author && c.html && c.date)));
  t('글: 등급 아이콘이 첨부파일로 오인되지 않음', () => assert.equal(doc.attachments.length, 0));
  console.log('   예:', JSON.stringify({ ...doc, html: doc.html.slice(0, 40), comments: doc.comments.map((c) => ({ ...c, html: c.html.slice(0, 30) })) }));
}
// 이미지·첨부·대댓글·태그가 있는 글 (작품 게시판)
if (richFile) {
  const doc = parseDoc(readFileSync(richFile, 'utf8'), { srl: richSrl });
  t('작품글: 읽기 성공', () => assert.equal(doc.ok, true));
  t('작품글: 첨부파일 2개 (이름·용량·번호)', () => {
    assert.equal(doc.attachments.length, 2);
    assert.ok(doc.attachments.every((a) => a.name && a.sizeBytes > 0 && a.fileSrl && a.url.startsWith('http')));
  });
  t('작품글: 본문 이미지', () => assert.ok(doc.images.length >= 1 && doc.images.every((u) => /^https?:/.test(u))));
  t('작품글: 해시태그', () => assert.ok(doc.tags.includes('개사') && doc.tags.every((x) => !x.startsWith('#'))));
  const byId = new Map(doc.comments.map((c) => [c.srl, c]));
  t('작품글: 대댓글 부모 연결', () => {
    assert.equal(byId.get(898045).parentSrl, 897800); // ind1 → 바로 앞 최상위
    assert.equal(byId.get(898050).parentSrl, 898018); // 다른 최상위 밑
    assert.equal(byId.get(898374).parentSrl, 898050); // ind2 → 바로 앞 ind1
    assert.equal(byId.get(897800).parentSrl, null);
    assert.equal(byId.get(910232).parentSrl, 910082);
    assert.equal(byId.get(1154963).parentSrl, null); // 다시 최상위로 돌아옴
  });
  console.log('   예:', JSON.stringify({ tags: doc.tags, attachments: doc.attachments, images: doc.images.slice(0, 2) }));
}
// 웹진 스킨 목록 + 제작진 표 (팀 더빙 작품), 회원 전용 게시판 (질문/건의)
const [zineList, zineDoc, zineSrl, deniedFile] = process.argv.slice(7);
if (zineList) {
  const list = parseList(readFileSync(zineList, 'utf8'));
  t(`웹진 목록: 글 ${list.rows.length}개`, () => assert.ok(list.rows.length >= 10 && list.denied === false));
  t('웹진 목록: 제목·글번호·댓글·조회·썸네일', () => assert.ok(list.rows.every((r) => r.srl > 0 && r.title) && list.rows.some((r) => r.commentCount > 0 && r.readCount > 0 && /^https?:/.test(r.thumbnail ?? ''))));
  t('웹진 목록: 쪽수', () => assert.ok(list.lastPage >= 2));
  console.log('   예:', JSON.stringify(list.rows[0]));
}
if (zineDoc) {
  const doc = parseDoc(readFileSync(zineDoc, 'utf8'), { srl: zineSrl });
  t('제작진 표: 노래·녹음·믹싱·가사·번역·공개일', () => {
    const m = Object.fromEntries(doc.extra.map((e) => [e.label, e.value]));
    assert.equal(m['노래'], '세훈'); assert.equal(m['번역'], '바사삭'); assert.equal(m['공개일'], '2021-02-20');
  });
  t('제작진 표: 음원 받기는 회원 전용 링크로 표시', () => {
    const f = doc.extra.find((e) => e.label.includes('음원'));
    assert.ok(f?.link?.includes('procFileDownload') && f.memberOnly === true);
  });
  t('제작진 표가 본문에 섞이지 않음', () => assert.ok(!doc.html.includes('Extra Form')));
}
if (deniedFile) {
  const list = parseList(readFileSync(deniedFile, 'utf8'));
  t('회원 전용 게시판: 글 없음 + 권한 안내를 구분', () => assert.ok(list.rows.length === 0 && list.denied === true));
}
console.log(`\n${pass}개 통과`);
