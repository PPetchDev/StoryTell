/**
 * An Arc change as the Dashboard reads it (.scratch/arc-changes/spec.md): "After …" and the cause
 * the Judge wrote. The Judge writes causes as sentences ("The letter arrived."), so a leading
 * article is lowered to read on after "After"; names and everything else stay as written.
 */
export function afterCause(cause: string): string {
    const trimmed = cause.trim();
    return `After ${trimmed.replace(/^(The|An|A)(?=\s)/, (article) => article.toLowerCase())}`;
}
