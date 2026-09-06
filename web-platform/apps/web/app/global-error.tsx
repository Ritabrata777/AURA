"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#121212] p-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-8 text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-white/50">
            Please reload. If this keeps happening, sign out and back in.
          </p>
          <button
            onClick={() => reset()}
            className="mt-6 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-500"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
