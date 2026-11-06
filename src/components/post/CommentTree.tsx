import type { CommentNode } from "@/lib/data";
import { cleanHtml } from "@/lib/sanitize";

const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

// 댓글·대댓글을 parent_id 로 묶어 들여쓰기로 보여준다
export default function CommentTree({ comments }: { comments: CommentNode[] }) {
  const byParent = new Map<number | null, CommentNode[]>();
  for (const c of comments) {
    const key = c.parentId;
    const list = byParent.get(key);
    if (list) list.push(c);
    else byParent.set(key, [c]);
  }
  const roots = byParent.get(null) ?? [];

  if (roots.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">아직 댓글이 없어요.</p>;
  }

  return (
    <ul className="divide-y divide-line/70">
      {roots.map((c) => (
        <CommentItem key={c.id} comment={c} byParent={byParent} depth={0} />
      ))}
    </ul>
  );
}

function CommentItem({ comment, byParent, depth }: { comment: CommentNode; byParent: Map<number | null, CommentNode[]>; depth: number }) {
  const replies = byParent.get(comment.id) ?? [];

  return (
    <li className="py-3" style={depth ? { marginLeft: `${Math.min(depth, 4) * 1.5}rem` } : undefined}>
      <div className="flex items-baseline gap-2 text-xs text-muted">
        <span className="font-bold text-fg">{comment.author}</span>
        <span>{date.format(new Date(comment.createdAt))}</span>
      </div>
      <div className="mt-1 break-words text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: cleanHtml(comment.content) }} />
      {replies.length > 0 && (
        <ul className="mt-2 space-y-3 border-l border-line pl-4">
          {replies.map((r) => (
            <CommentItem key={r.id} comment={r} byParent={byParent} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
