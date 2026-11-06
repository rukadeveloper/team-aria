import sanitizeHtml from 'sanitize-html';

// 게시글·댓글 본문은 HTML 이다 (기존 XE 글 포함). 화면에 그리기 전에 반드시 이걸 거친다.
// 스크립트·이벤트 속성은 지우고, 글에 흔히 쓰는 태그와 유튜브 영상 삽입만 허용한다
const YOUTUBE = ['www.youtube.com', 'www.youtube-nocookie.com', 'youtube.com'];

export function cleanHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      'p', 'br', 'hr', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'blockquote', 'pre', 'code',
      'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'iframe',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'title'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      '*': ['style'],
    },
    // 스타일은 글자색·정렬 정도만
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
        'text-align': [/^(left|right|center|justify)$/],
        'font-weight': [/^(bold|normal|[1-9]00)$/],
        'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedIframeHostnames: YOUTUBE,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    },
  });
}
