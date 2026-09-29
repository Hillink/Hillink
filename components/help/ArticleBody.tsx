import Link from "next/link";
import type { ReactNode } from "react";

// Renders an article body written with light formatting, without ever injecting HTML:
//   blank line = new paragraph, "## " heading, "- " bullets, "1. " numbered list,
//   **bold**, and [text](link) where the link is a Hillink path, https:// or mailto:.

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^https:\/\/[^\s]+$/i.test(href) || /^mailto:[^\s]+$/i.test(href)) return href;
  return null;
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${i++}`;
    if (match[1] !== undefined) {
      out.push(<strong key={key}>{match[1]}</strong>);
    } else {
      const href = safeHref(match[3]);
      if (!href) out.push(match[2]);
      else if (href.startsWith("/")) out.push(<Link key={key} href={href} className="help-inline-link">{match[2]}</Link>);
      else out.push(<a key={key} href={href} className="help-inline-link" target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{match[2]}</a>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function ArticleBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="help-body">
      {blocks.map((block, index) => {
        const key = `b${index}`;
        const lines = block.split("\n").map((l) => l.trim());
        if (block.startsWith("### ")) return <h3 key={key}>{inline(block.slice(4), key)}</h3>;
        if (block.startsWith("## ")) return <h2 key={key}>{inline(block.slice(3), key)}</h2>;
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={key}>
              {lines.map((l, j) => <li key={j}>{inline(l.slice(2), `${key}-${j}`)}</li>)}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\.\s/.test(l))) {
          return (
            <ol key={key}>
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\.\s/, ""), `${key}-${j}`)}</li>)}
            </ol>
          );
        }
        return <p key={key}>{inline(lines.join(" "), key)}</p>;
      })}
    </div>
  );
}
