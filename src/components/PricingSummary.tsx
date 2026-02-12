"use client";

import { useState } from "react";

const BASE_PRICE = 7;

interface Props {
  selectedSkills: string[];
}

export default function PricingSummary({ selectedSkills }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCheckout = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: selectedSkills }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Checkout failed");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sticky top-24 p-6 rounded-2xl bg-white/5 border border-white/10 pricing-card">
      <h3 className="text-xl font-bold mb-6">Your Arcamatrix</h3>

      {/* Base */}
      <div className="flex justify-between items-center py-3 border-b border-white/10">
        <div>
          <div className="font-medium">AI Assistant Platform</div>
          <div className="text-sm text-gray-400">All skills included</div>
        </div>
        <div className="text-right">
          <span className="font-semibold">${BASE_PRICE}</span>
          <span className="text-gray-500 text-sm">/mo</span>
        </div>
      </div>

      {/* Selected Skills */}
      {selectedSkills.length > 0 && (
        <div className="py-3 border-b border-white/10">
          <div className="text-sm text-gray-400 mb-2">
            {selectedSkills.length} skill{selectedSkills.length !== 1 ? "s" : ""} selected
          </div>
          <div className="text-xs text-green-400">All skills are included free</div>
        </div>
      )}

      {/* Total */}
      <div className="flex justify-between items-center py-4">
        <div className="text-lg font-semibold">Total</div>
        <div>
          <span className="text-3xl font-bold text-arca-primary">${BASE_PRICE}</span>
          <span className="text-gray-400">/mo</span>
        </div>
      </div>

      {/* Discount note */}
      <p className="text-xs text-gray-400 mb-4 text-center">
        Have a discount code? You can enter it at checkout.
      </p>

      {error && (
        <p className="text-xs text-red-400 mb-3 text-center">{error}</p>
      )}

      {/* CTA */}
      <button
        onClick={handleCheckout}
        disabled={selectedSkills.length === 0 || loading}
        className={`w-full py-4 rounded-xl font-semibold text-lg transition ${
          selectedSkills.length > 0 && !loading
            ? "bg-gradient-to-r from-arca-primary to-arca-secondary glow btn-hover"
            : "bg-gray-700 text-gray-400 cursor-not-allowed"
        }`}
      >
        {loading ? "Redirecting..." : selectedSkills.length > 0 ? "Get Started" : "Select at least one skill"}
      </button>

      <p className="text-xs text-gray-500 text-center mt-4">
        Cancel anytime. No long-term commitment.
      </p>
    </div>
  );
}
