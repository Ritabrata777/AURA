"use client";

import { notFound } from "next/navigation";
import { useEffect, useState } from "react";

export default function DebugPage() {
  // Market-release guard: this page dumps the raw session token. It is a
  // dev-only diagnostic — never render it in production.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const [cookies, setCookies] = useState<string>("");
  const [sessionStorage, setSessionStorage] = useState<string>("");

  useEffect(() => {
    setCookies(document.cookie);
    const session = window.sessionStorage.getItem("health-platform.session");
    setSessionStorage(session || "null");
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Debug Info</h1>
      
      <div className="bg-white rounded-lg border p-4 mb-4">
        <h2 className="font-semibold mb-2">Cookies:</h2>
        <pre className="text-xs overflow-auto bg-gray-50 p-2 rounded">
          {cookies || "No cookies"}
        </pre>
      </div>

      <div className="bg-white rounded-lg border p-4 mb-4">
        <h2 className="font-semibold mb-2">Session Storage:</h2>
        <pre className="text-xs overflow-auto bg-gray-50 p-2 rounded whitespace-pre-wrap">
          {sessionStorage}
        </pre>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h2 className="font-semibold mb-2">Current URL:</h2>
        <p className="text-sm">{typeof window !== "undefined" ? window.location.href : "SSR"}</p>
      </div>
    </div>
  );
}
