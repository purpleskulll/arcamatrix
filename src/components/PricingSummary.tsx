"use client";

interface Skill {
  id: string;
  name: string;
  price: number;
}

const skillData: Record<string, Skill> = {
  "whatsapp": { id: "whatsapp", name: "WhatsApp", price: 5 },
  "telegram": { id: "telegram", name: "Telegram", price: 5 },
  "discord": { id: "discord", name: "Discord", price: 5 },
  "slack": { id: "slack", name: "Slack", price: 5 },
  "email": { id: "email", name: "Email (Gmail)", price: 5 },
  "imessage": { id: "imessage", name: "iMessage", price: 7 },
  "signal": { id: "signal", name: "Signal", price: 5 },
  "calendar": { id: "calendar", name: "Calendar", price: 3 },
  "notion": { id: "notion", name: "Notion", price: 4 },
  "obsidian": { id: "obsidian", name: "Obsidian", price: 4 },
  "trello": { id: "trello", name: "Trello", price: 3 },
  "github": { id: "github", name: "GitHub", price: 5 },
  "spotify": { id: "spotify", name: "Spotify", price: 3 },
  "youtube": { id: "youtube", name: "YouTube", price: 3 },
  "hue": { id: "hue", name: "Philips Hue", price: 3 },
  "homekit": { id: "homekit", name: "HomeKit", price: 4 },
  "weather": { id: "weather", name: "Weather", price: 2 },
  "web-search": { id: "web-search", name: "Web Search", price: 3 },
  "voice": { id: "voice", name: "Voice Calls", price: 8 },
};

const BASE_PRICE = 19;

interface Props {
  selectedSkills: string[];
}

export default function PricingSummary({ selectedSkills }: Props) {
  const skillsTotal = selectedSkills.reduce((sum, id) => sum + (skillData[id]?.price || 0), 0);
  const total = BASE_PRICE + skillsTotal;

  const handleCheckout = async () => {
    // TODO: Integrate with Stripe
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: selectedSkills }),
    });
    const { url } = await response.json();
    if (url) {
      window.location.href = url;
    }
  };

  return (
    <div className="sticky top-24 p-6 rounded-2xl bg-white/5 border border-white/10 pricing-card">
      <h3 className="text-xl font-bold mb-6">Your Arcamatrix</h3>

      {/* Base */}
      <div className="flex justify-between items-center py-3 border-b border-white/10">
        <div>
          <div className="font-medium">Base Platform</div>
          <div className="text-sm text-gray-400">AI Assistant Core</div>
        </div>
        <div className="text-right">
          <span className="font-semibold">${BASE_PRICE}</span>
          <span className="text-gray-500 text-sm">/mo</span>
        </div>
      </div>

      {/* Selected Skills */}
      {selectedSkills.length > 0 && (
        <div className="py-3 border-b border-white/10">
          <div className="text-sm text-gray-400 mb-2">Selected Skills ({selectedSkills.length})</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedSkills.map(id => (
              <div key={id} className="flex justify-between text-sm">
                <span>{skillData[id]?.name}</span>
                <span className="text-gray-400">+${skillData[id]?.price}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="flex justify-between items-center py-4">
        <div className="text-lg font-semibold">Total</div>
        <div>
          <span className="text-3xl font-bold text-arca-primary">${total}</span>
          <span className="text-gray-400">/mo</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleCheckout}
        disabled={selectedSkills.length === 0}
        className={`w-full py-4 rounded-xl font-semibold text-lg transition ${
          selectedSkills.length > 0
            ? "bg-gradient-to-r from-arca-primary to-arca-secondary glow btn-hover"
            : "bg-gray-700 text-gray-400 cursor-not-allowed"
        }`}
      >
        {selectedSkills.length > 0 ? "Get Started" : "Select at least one skill"}
      </button>

      <p className="text-xs text-gray-500 text-center mt-4">
        Cancel anytime. No long-term commitment.
      </p>
    </div>
  );
}
