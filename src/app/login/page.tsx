"use client";

import { useState } from "react";

interface CustomerData {
  customer: { name: string; email: string };
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
  } | null;
  skills: string[];
  username: string;
  workspaceUrl: string;
}

const SKILL_LABELS: Record<string, string> = {
  "web-search": "Web Search",
  "obsidian": "Obsidian Notes",
  "spotify": "Spotify",
  "hue": "Philips Hue",
  "weather": "Weather",
  "github": "GitHub",
  "trello": "Trello",
  "notion": "Notion",
  "slack": "Slack",
  "google-calendar": "Google Calendar",
  "email": "Email",
  "summarize": "Summarize",
  "filesystem": "File System",
  "discord": "Discord",
  "telegram": "Telegram",
  "whatsapp": "WhatsApp",
  "calendar": "Calendar",
  "coding-agent": "Coding Agent",
  "youtube": "YouTube",
  "homekit": "HomeKit",
  "voice": "Voice",
  "1password": "1Password",
  "canvas": "Canvas",
  "gemini": "Gemini",
  "video-frames": "Video Frames",
  "image-gen": "Image Gen",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CustomerData | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json();

      if (result.error) {
        setError(result.error);
      } else if (result.sessionToken) {
        setSessionToken(result.sessionToken);
        setData(result);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action: "portal", sessionToken }),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("Could not open subscription portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleLogout = () => {
    setData(null);
    setEmail("");
    setPassword("");
    setSessionToken("");
    setError("");
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Login form
  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <a href="/" className="inline-flex items-center space-x-2 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-arca-primary to-arca-secondary rounded-lg"></div>
              <span className="text-2xl font-bold">Arcamatrix</span>
            </a>
            <h1 className="text-2xl font-bold mb-2">Customer Dashboard</h1>
            <p className="text-gray-400">
              Sign in with your email and password.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-arca-primary focus:outline-none text-white placeholder-gray-500"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-arca-primary hover:bg-arca-secondary transition font-medium disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="text-center mt-6">
            <a href="/" className="text-sm text-gray-400 hover:text-white transition">
              Back to Home
            </a>
          </div>
        </div>
      </main>
    );
  }

  // Dashboard
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center space-x-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-arca-primary to-arca-secondary rounded-lg"></div>
            <span className="text-2xl font-bold">Arcamatrix</span>
          </a>
        </div>

        <div className="space-y-6">
          {/* Welcome */}
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-1">
              Welcome, {data.customer.name}
            </h1>
            <p className="text-gray-400 text-sm">{data.customer.email}</p>
          </div>

          {/* Subscription Status */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/10">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Subscription
            </h2>
            {data.subscription ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Status</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    data.subscription.cancelAtPeriodEnd
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-green-500/20 text-green-400"
                  }`}>
                    {data.subscription.cancelAtPeriodEnd ? "Cancels at period end" : "Active"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Renews</span>
                  <span className="text-white">{formatDate(data.subscription.currentPeriodEnd)}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">No active subscription found.</p>
            )}
          </div>

          {/* Skills */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/10">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Your Skills
            </h2>
            {data.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-3 py-1.5 rounded-lg bg-arca-primary/20 text-arca-primary border border-arca-primary/30 text-sm font-medium"
                  >
                    {SKILL_LABELS[skill] || skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No skills configured yet.</p>
            )}
          </div>

          {/* Workspace Link */}
          {data.workspaceUrl && (
            <a
              href={data.workspaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 rounded-lg bg-arca-primary hover:bg-arca-secondary transition font-medium text-center"
            >
              Open AI Workspace
            </a>
          )}

          {/* Manage / Cancel */}
          <div className="flex gap-3">
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="flex-1 py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition font-medium text-gray-300 disabled:opacity-50"
            >
              {portalLoading ? "Loading..." : "Manage Subscription"}
            </button>
            <button
              onClick={handleLogout}
              className="py-3 px-5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition text-gray-400"
            >
              Logout
            </button>
          </div>

          <div className="text-center">
            <a href="/" className="text-sm text-gray-400 hover:text-white transition">
              Back to Home
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
