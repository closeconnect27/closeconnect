import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-3xl font-extrabold">
        close<span className="text-green">.connect</span>
      </h1>
      <p className="text-text2">Find your people. Host what you love.</p>
      <Link
        href="/communities"
        className="rounded-full bg-green px-5 py-2 text-sm font-bold text-green-dark hover:bg-green-mid"
      >
        Browse communities
      </Link>
    </div>
  );
}
