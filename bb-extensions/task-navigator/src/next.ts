export interface TaskCommentForNext {
  body: string;
  createdAt: string | number;
}

export interface ParsedNext {
  next: string | null;
  lastNextAt: number | null;
}

function timestamp(value: string | number): number | null {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The first line is the durable handoff marker; later prose is irrelevant. */
export function parseNext(
  comments: readonly TaskCommentForNext[],
): ParsedNext {
  let latest: { next: string | null; createdAt: number } | null = null;
  for (const comment of comments) {
    const createdAt = timestamp(comment.createdAt);
    if (createdAt === null) continue;
    const firstLine = comment.body.split(/\r?\n/, 1)[0] ?? "";
    const match = /^\s*next\s*[:：]\s*(.*?)\s*$/iu.exec(firstLine);
    if (match === null) continue;
    if (latest !== null && createdAt <= latest.createdAt) continue;
    const value = match[1]?.trim() ?? "";
    latest = {
      next: value === "" || /^none$/iu.test(value) ? null : value,
      createdAt,
    };
  }
  return latest === null
    ? { next: null, lastNextAt: null }
    : { next: latest.next, lastNextAt: latest.createdAt };
}
