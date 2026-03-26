import Link from "next/link";

export default function Navbar() {
  return (
    <div className="flex justify-between p-4 border-b">
      <h1 className="font-bold text-xl">HILLink</h1>
      <div className="flex gap-4">
        <Link href="/business">Business</Link>
        <Link href="/athlete">Athlete</Link>
      </div>
    </div>
  );
}
