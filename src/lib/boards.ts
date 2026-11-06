// 게시판 메뉴 구조. 기본 게시판은 supabase/migrations/0001_init.sql 과 같아야 한다.
export type Grade = 'member' | 'regular' | 'team' | 'admin';

export const GRADE_LABEL: Record<Grade, string> = {
  member: '일반회원',
  regular: '정회원',
  team: '팀원',
  admin: '관리팀원',
};

export const BOARD_GROUPS = [
  { key: 'team', title: '팀 아리아' },
  { key: 'community', title: '커뮤니티' },
  { key: 'works', title: '모두의 작품' },
  { key: 'official', title: '공식작품' },
] as const;
export type BoardGroup = (typeof BOARD_GROUPS)[number]['key'];

export interface BoardInfo {
  slug: string;
  title: string;
  group: BoardGroup;
  // 읽기에 필요한 등급 (없으면 누구나)
  readGrade?: Grade;
  writeGrade: Grade;
}

export const BOARDS: BoardInfo[] = [
  { slug: 'notice', title: '공지사항', group: 'team', writeGrade: 'admin' },
  { slug: 'request', title: '작품신청', group: 'team', writeGrade: 'member' },
  { slug: 'qna', title: '질문/건의', group: 'team', writeGrade: 'member' },
  { slug: 'archive', title: '자료실', group: 'team', readGrade: 'member', writeGrade: 'team' },
  { slug: 'free', title: '자유게시판', group: 'community', writeGrade: 'member' },
  { slug: 'humor', title: '유머게시판', group: 'community', writeGrade: 'member' },
  { slug: 'radio', title: '라디오', group: 'community', writeGrade: 'member' },
  { slug: 'attendance', title: '출석부', group: 'community', readGrade: 'member', writeGrade: 'member' },
  { slug: 'rankup', title: '승급 신청', group: 'community', readGrade: 'member', writeGrade: 'member' },
  { slug: 'event', title: '이벤트', group: 'community', writeGrade: 'team' },
  { slug: 'works', title: '작품 게시판', group: 'works', writeGrade: 'member' },
  { slug: 'collab', title: '합작 게시판', group: 'works', readGrade: 'regular', writeGrade: 'regular' },
  { slug: 'official', title: '팀 더빙 작품', group: 'official', writeGrade: 'team' },
  { slug: 'team-radio', title: '팀 라디오', group: 'official', writeGrade: 'team' },
  { slug: 'unit', title: '팀 유닛 작품', group: 'official', writeGrade: 'team' },
  { slug: 'toon', title: '아리아툰', group: 'official', writeGrade: 'team' },
];

export const boardBySlug = (slug: string) => BOARDS.find((b) => b.slug === slug);
