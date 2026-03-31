import Link from "next/link";

export default function WaitlistSelector() {
  return (
    <div className="waitlist-selector-grid">
      <Link href="/waitlist/athlete" className="waitlist-option waitlist-option-athlete">
        I&apos;m an Athlete
      </Link>

      <Link href="/waitlist/business" className="waitlist-option waitlist-option-business">
        I&apos;m a Business
      </Link>
    </div>
  );
}
