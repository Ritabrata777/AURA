import Link from "next/link";

export const metadata = { title: "Safety Information" };

export default function SafetyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-white">
      <h1 className="text-3xl font-bold">Safety information</h1>
      <p className="mt-2 text-sm text-white/50">
        Read this before relying on any reading.
      </p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-white/70">
        <p>
          AURA and its connected sensors are not certified medical devices. They do not
          diagnose, treat, or prevent any disease.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Check sensor placement if a reading looks wrong; poor contact is the most common cause.</li>
          <li>ECG traces here are single-lead wellness recordings, not clinical 12-lead ECGs.</li>
          <li>Keep the device dry, away from heat, and out of reach of children.</li>
          <li>In an emergency, call local emergency services first — not this app.</li>
        </ul>
      </div>
      <Link href="/" className="mt-8 inline-block text-sm font-medium text-violet-300 hover:text-blue-200">
        Back to sign in
      </Link>
    </div>
  );
}
