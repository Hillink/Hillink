import Link from "next/link";

// A small "?" link from a screen to the Help article that explains it. Opening an article the reader
// can't see just shows the Help Center's "not found" page, so a wrong or retired slug fails safely.
export default function HelpLink({
  slug,
  category,
  label,
  className,
}: {
  slug: string;
  category: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={`/help/${category}/${slug}`}
      className={className}
      title={label}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--muted)" }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1px solid var(--border)",
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        ?
      </span>
      <span>{label}</span>
    </Link>
  );
}
