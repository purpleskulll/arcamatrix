"use client";

import { useState, useEffect } from "react";
import ChatInterface from "@/components/ChatInterface";

interface CustomerData {
  email: string;
  skills: string[];
  spriteUrl: string;
  status: "online" | "offline" | "connecting";
  aiProvider: string;
}

export default function DashboardPage() {
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "settings" | "skills">("chat");

  useEffect(() => {
    // TODO: Fetch customer data from API
    setCustomer({
      email: "demo@example.com",
      skills: ["whatsapp", "email", "calendar", "github"],
      spriteUrl: "https://demo.sprites.dev",
      status: "online",
      aiProvider: "anthropic"
    });
  }, []);

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-arca-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-arca-darker">
      {/* Header */}
      <header className="border-b border-white/10 bg-arca-darker/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-gradient-to-br from-arca-primary to-arca-secondary rounded-lg"></div>
            <span className="text-xl font-bold">Arcamatrix</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">Dashboard</span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${
                customer.status === "online" ? "bg-green-400" :
                customer.status === "connecting" ? "bg-yellow-400 animate-pulse" :
                "bg-red-400"
              }`}></span>
              <span className="text-sm text-gray-400">{customer.status}</span>
            </div>
            <span className="text-sm text-gray-500">{customer.email}</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-white/5 rounded-lg p-1 w-fit">
          {(["chat", "skills", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-arca-primary text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Chat Tab */}
        {activeTab === "chat" && (
          <div className="grid lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <ChatInterface spriteUrl={customer.spriteUrl} />
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h3 className="font-semibold mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-left text-sm transition">
                    Check my emails
                  </button>
                  <button className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-left text-sm transition">
                    What is on my calendar?
                  </button>
                  <button className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-left text-sm transition">
                    Summarize notifications
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h3 className="font-semibold mb-3">Active Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {customer.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-1 rounded-full bg-arca-primary/20 text-arca-primary text-xs"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === "skills" && (
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <h2 className="text-xl font-bold mb-4">Your Skills</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customer.skills.map((skill) => (
                <div key={skill} className="p-4 rounded-lg bg-white/5 border border-arca-primary/30">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{skill}</span>
                    <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">Connected and Active</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <h2 className="text-xl font-bold mb-6">Settings</h2>

            <div className="space-y-8">
              {/* AI Provider Selection */}
              <div>
                <label className="block text-sm font-medium mb-3">AI Provider</label>
                <div className="grid md:grid-cols-3 gap-4 max-w-2xl">
                  {["anthropic", "openai", "google"].map((provider) => (
                    <button
                      key={provider}
                      className={`p-4 rounded-lg border text-left transition ${
                        customer.aiProvider === provider
                          ? "border-arca-primary bg-arca-primary/10"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="font-medium capitalize">{provider}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {provider === "anthropic" && "Claude models"}
                        {provider === "openai" && "GPT models"}
                        {provider === "google" && "Gemini models"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium mb-2">Your API Key</label>
                <input
                  type="password"
                  placeholder={
                    customer.aiProvider === "anthropic" ? "sk-ant-..." :
                    customer.aiProvider === "openai" ? "sk-..." :
                    "AIza..."
                  }
                  className="w-full max-w-md px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-arca-primary focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your API key is stored securely on your dedicated instance.
                </p>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <select className="w-full max-w-md px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-arca-primary focus:outline-none">
                  {customer.aiProvider === "anthropic" && (
                    <>
                      <option value="claude-opus-4">Claude Opus 4</option>
                      <option value="claude-sonnet-4">Claude Sonnet 4</option>
                      <option value="claude-haiku">Claude Haiku</option>
                    </>
                  )}
                  {customer.aiProvider === "openai" && (
                    <>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </>
                  )}
                  {customer.aiProvider === "google" && (
                    <>
                      <option value="gemini-pro">Gemini Pro</option>
                      <option value="gemini-ultra">Gemini Ultra</option>
                    </>
                  )}
                </select>
              </div>

              {/* Danger Zone */}
              <div className="pt-6 border-t border-white/10">
                <h3 className="text-red-400 font-medium mb-2">Danger Zone</h3>
                <button className="px-4 py-2 rounded-lg border border-red-400/50 text-red-400 hover:bg-red-400/10 text-sm transition">
                  Cancel Subscription
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
