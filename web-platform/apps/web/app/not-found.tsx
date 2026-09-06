import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-8 text-center text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-white/40">404</p>
        <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-white/50">
          This link doesn&apos;t lead anywhere. Your health data is unaffected.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-500"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
