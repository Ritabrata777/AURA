import Link from "next/link";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-white">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-white/50">
        Draft — have this reviewed by a lawyer before market release.
      </p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-white/70">
        <p>
          AURA is currently an engineering prototype. Measurements are provided for
          monitoring and development purposes and are not a medical diagnosis.
        </p>
        <p>
          Always seek the advice of a qualified clinician with questions about a medical
          condition, and never disregard professional advice because of anything shown
          in this app. In an emergency, contact local emergency services.
        </p>
        <p>
          You are responsible for keeping your credentials confidential and for ensuring
          any device you pair belongs to you.
        </p>
      </div>
      <Link href="/" className="mt-8 inline-block text-sm font-medium text-violet-300 hover:text-blue-200">
        Back to sign in
      </Link>
    </div>
  );
}
