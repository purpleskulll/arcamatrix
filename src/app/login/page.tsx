"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "No subscription found for this email.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center space-x-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-arca-primary to-arca-secondary rounded-lg"></div>
            <span className="text-2xl font-bold">Arcamatrix</span>
          </a>
          <h1 className="text-2xl font-bold mb-2">Manage Your Subscription</h1>
          <p className="text-gray-400">
            Enter your email to access billing, invoices, and subscription settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-arca-primary focus:outline-none text-white placeholder-gray-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-arca-primary hover:bg-arca-secondary transition font-medium disabled:opacity-50"
          >
            {loading ? "Loading..." : "Open Customer Portal"}
          </button>
        </form>

        <div className="mt-8 p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-sm text-gray-400">
            <strong className="text-gray-300">Looking for your AI workspace?</strong><br />
            Check your welcome email for your personal workspace URL
            (e.g. <span className="text-arca-primary">yourname.arcamatrix.com</span>).
          </p>
        </div>

        <div className="text-center mt-6">
          <a href="/" className="text-sm text-gray-400 hover:text-white transition">
            Back to Home
          </a>
        </div>
      </div>
    </main>
  );
}
