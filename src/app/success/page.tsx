"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface SessionData {
  customerEmail: string;
  customerName: string;
  skills: string[];
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  // Password form state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const id = searchParams.get("session_id");
    setSessionId(id);

    if (id) {
      fetch(`/api/session?session_id=${id}`)
        .then(res => res.json())
        .then(data => {
          setSessionData(data);
        })
        .catch(err => {
          console.error("Failed to fetch session data:", err);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch("/api/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, password }),
      });
      const result = await res.json();
      if (result.error) {
        setPasswordError(result.error);
      } else {
        setPasswordSet(true);
      }
    } catch {
      setPasswordError("Something went wrong. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-arca-darker">
      <div className="text-center max-w-2xl">
        {/* Success Icon */}
        <div className="relative mb-8">
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Payment Successful!
        </h1>

        <h2 className="text-2xl font-semibold text-arca-primary mb-6">
          Your AI Workspace is Being Set Up
        </h2>

        {/* Customer Info */}
        {sessionData && !loading && (
          <div className="mb-8 p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-gray-300">
              <strong>Email:</strong> {sessionData.customerEmail}
            </p>
            {sessionData.customerName && (
              <p className="text-gray-300 mt-2">
                <strong>Name:</strong> {sessionData.customerName}
              </p>
            )}
            {sessionData.skills && sessionData.skills.length > 0 && (
              <div className="mt-3">
                <p className="text-gray-400 text-sm mb-2">Selected Skills:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {sessionData.skills.map((skill: string) => (
                    <span key={skill} className="px-3 py-1 bg-arca-primary/20 rounded-full text-sm text-arca-primary border border-arca-primary/30">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Password Setup Form */}
        {sessionId && !passwordSet && (
          <div className="mb-8 p-6 rounded-xl bg-gradient-to-br from-arca-primary/10 to-arca-secondary/10 border border-arca-primary/30">
            <div className="flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-arca-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-white mb-2">
              Set Your Password
            </p>
            <p className="text-gray-300 text-sm mb-4">
              This password will be used to log in to your Dashboard and AI Workspace.
            </p>
            <form onSubmit={handleSetPassword} className="space-y-3 max-w-sm mx-auto">
              <input
                type="password"
                placeholder="Password (min. 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-arca-primary focus:outline-none text-white placeholder-gray-500"
              />
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-arca-primary focus:outline-none text-white placeholder-gray-500"
              />
              {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full py-3 rounded-lg bg-arca-primary hover:bg-arca-secondary transition font-medium disabled:opacity-50"
              >
                {passwordLoading ? "Saving..." : "Set Password"}
              </button>
            </form>
          </div>
        )}

        {/* Password Set Success */}
        {passwordSet && (
          <div className="mb-8 p-6 rounded-xl bg-green-500/10 border border-green-500/30">
            <div className="flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-green-400 mb-2">
              Password Set Successfully!
            </p>
            <p className="text-gray-300 text-sm">
              Use your email and password to log in to your Dashboard and AI Workspace.
            </p>
          </div>
        )}

        {/* What's Happening */}
        <div className="p-6 rounded-xl bg-white/5 border border-white/10 mb-8 text-left">
          <h3 className="text-lg font-semibold text-center mb-4 text-arca-primary">
            What&apos;s Happening Right Now?
          </h3>
          <ul className="space-y-4">
            <li className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-arca-primary/20 rounded-full flex items-center justify-center">
                <span className="text-arca-primary font-bold">1</span>
              </div>
              <div>
                <p className="font-medium text-white">Creating Your Dedicated Sprite VM</p>
                <p className="text-sm text-gray-400">A secure, isolated AI environment just for you</p>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-arca-primary/20 rounded-full flex items-center justify-center">
                <span className="text-arca-primary font-bold">2</span>
              </div>
              <div>
                <p className="font-medium text-white">Installing OpenClaw with Your Skills</p>
                <p className="text-sm text-gray-400">Configuring your selected capabilities</p>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-arca-primary/20 rounded-full flex items-center justify-center">
                <span className="text-arca-primary font-bold">3</span>
              </div>
              <div>
                <p className="font-medium text-white">Setting Up Your AI Workspace</p>
                <p className="text-sm text-gray-400">Custom UI with your selected skills</p>
              </div>
            </li>
          </ul>
        </div>

        {/* Expected Time */}
        <div className="mb-8">
          <p className="text-gray-400">
            <strong className="text-arca-primary">Expected setup time:</strong> 2-5 minutes
          </p>
          <p className="text-sm text-gray-500 mt-2">
            You&apos;ll receive a welcome email with your workspace URL once ready.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <a
            href="/login"
            className="inline-block w-full px-6 py-4 rounded-xl bg-gradient-to-r from-arca-primary to-arca-secondary hover:opacity-90 transition font-semibold text-lg"
          >
            Go to Dashboard
          </a>
          <a
            href="/"
            className="inline-block w-full px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition"
          >
            Back to Home
          </a>
        </div>

        {/* Support Link */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <p className="text-sm text-gray-400">
            Questions? <a href="mailto:support@arcamatrix.com" className="text-arca-primary hover:underline">Contact Support</a>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-arca-darker">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-arca-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </main>
    }>
      <SuccessContent />
    </Suspense>
  );
}
