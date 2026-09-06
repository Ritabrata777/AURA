import Link from "next/link";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-white">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-white/50">
        Last updated September 2026. Have this reviewed by a lawyer before market release.
      </p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-white/70">
        <p>
          AURA collects account details and health measurements from your connected device
          (heart rate, SpO2, temperature, ECG) to display them to you and, with your
          consent, to clinicians you approve.
        </p>
        <p>
          Health data is sensitive. It is transmitted over encrypted connections, stored
          with access limited to you and explicitly authorized parties, and never sold.
        </p>
        <p>
          You may request export or deletion of your data at any time. Deletion removes
          measurements and sessions associated with your account from production systems.
        </p>
        <p>
          Contact details and the data-retention schedule will be published here before
          commercial launch.
        </p>
      </div>
      <Link href="/" className="mt-8 inline-block text-sm font-medium text-violet-300 hover:text-blue-200">
        Back to sign in
      </Link>
    </div>
  );
}
