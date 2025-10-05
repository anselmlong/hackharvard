"use client";

import { useState } from "react";
import { Captcha } from "~/components/Captcha";

export default function TestCaptchaPage() {
  const [verified, setVerified] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const handleSuccess = () => {
    setVerified(true);
  };

  const handleReset = () => {
    setVerified(false);
    setResetKey((prev) => prev + 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Form submitted successfully!");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-100 to-gray-200 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Freak-cha Test
          </h1>
          <p className="text-gray-600">
            Testing the Cloudflare Turnstile-style CAPTCHA
          </p>
        </div>

        {/* Demo Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 shadow-md">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Sample Form
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!verified}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <textarea
                placeholder="Your message..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!verified}
              />
            </div>

            {/* CAPTCHA */}
            <div className="flex items-center justify-between pt-4">
              <Captcha
                key={resetKey}
                onSuccess={handleSuccess}
                onError={(error) => console.error(error)}
                failurePercentage={100}
              />

              {verified && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
                >
                  Reset
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!verified}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition"
            >
              {verified ? "Submit" : "Complete CAPTCHA to submit"}
            </button>
          </div>
        </form>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">How to test:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            <li>Click the "I'm not a robot" checkbox</li>
            <li>Answer the question using tongue gestures (Yes = Up/Down, No = Left/Right)</li>
            <li>Once verified, submit the form</li>
          </ol>
        </div>

        {/* Status */}
        {verified && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="text-green-800 font-semibold">
              ✓ Verified! Ready to submit
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
