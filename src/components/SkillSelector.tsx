"use client";

interface Skill {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  icon: string;
}

const skills: Skill[] = [
  // Communication
  { id: "whatsapp", name: "WhatsApp", description: "Send and receive WhatsApp messages", price: 5, category: "Communication", icon: "💬" },
  { id: "telegram", name: "Telegram", description: "Full Telegram bot integration", price: 5, category: "Communication", icon: "✈️" },
  { id: "discord", name: "Discord", description: "Manage Discord servers and DMs", price: 5, category: "Communication", icon: "🎮" },
  { id: "slack", name: "Slack", description: "Workspace messaging and automation", price: 5, category: "Communication", icon: "💼" },
  { id: "email", name: "Email (Gmail)", description: "Read, send, and organize emails", price: 5, category: "Communication", icon: "📧" },
  { id: "imessage", name: "iMessage", description: "Send messages via iMessage", price: 7, category: "Communication", icon: "🍎" },
  { id: "signal", name: "Signal", description: "Secure Signal messaging", price: 5, category: "Communication", icon: "🔐" },

  // Productivity
  { id: "calendar", name: "Calendar", description: "Manage events and scheduling", price: 3, category: "Productivity", icon: "📅" },
  { id: "notion", name: "Notion", description: "Read and write Notion pages", price: 4, category: "Productivity", icon: "📝" },
  { id: "obsidian", name: "Obsidian", description: "Manage your knowledge vault", price: 4, category: "Productivity", icon: "🗃️" },
  { id: "trello", name: "Trello", description: "Board and card management", price: 3, category: "Productivity", icon: "📋" },
  { id: "github", name: "GitHub", description: "Repos, issues, PRs, and more", price: 5, category: "Productivity", icon: "🐙" },

  // Media & Entertainment
  { id: "spotify", name: "Spotify", description: "Control playback and playlists", price: 3, category: "Media", icon: "🎵" },
  { id: "youtube", name: "YouTube", description: "Search and summarize videos", price: 3, category: "Media", icon: "📺" },

  // Smart Home
  { id: "hue", name: "Philips Hue", description: "Control your smart lights", price: 3, category: "Smart Home", icon: "💡" },
  { id: "homekit", name: "HomeKit", description: "Apple Home automation", price: 4, category: "Smart Home", icon: "🏠" },

  // Utilities
  { id: "weather", name: "Weather", description: "Forecasts and alerts", price: 2, category: "Utilities", icon: "🌤️" },
  { id: "web-search", name: "Web Search", description: "Search and summarize the web", price: 3, category: "Utilities", icon: "🔍" },
  { id: "voice", name: "Voice Calls", description: "Make and receive voice calls", price: 8, category: "Utilities", icon: "📞" },
];

const categories = Array.from(new Set(skills.map(s => s.category)));

interface Props {
  selectedSkills: string[];
  onSkillsChange: (skills: string[]) => void;
}

export default function SkillSelector({ selectedSkills, onSkillsChange }: Props) {
  const toggleSkill = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      onSkillsChange(selectedSkills.filter(id => id !== skillId));
    } else {
      onSkillsChange([...selectedSkills, skillId]);
    }
  };

  return (
    <div className="space-y-8">
      {categories.map(category => (
        <div key={category}>
          <h3 className="text-lg font-semibold text-gray-300 mb-4">{category}</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {skills
              .filter(skill => skill.category === category)
              .map(skill => (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  className={`skill-card p-4 rounded-xl border text-left transition-all ${
                    selectedSkills.includes(skill.id)
                      ? "selected border-arca-primary bg-arca-primary/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{skill.icon}</span>
                      <div>
                        <div className="font-semibold">{skill.name}</div>
                        <div className="text-sm text-gray-400">{skill.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-arca-primary font-semibold">${skill.price}</span>
                      <span className="text-gray-500 text-sm">/mo</span>
                    </div>
                  </div>
                  {selectedSkills.includes(skill.id) && (
                    <div className="mt-2 flex justify-end">
                      <span className="text-xs text-arca-primary">✓ Selected</span>
                    </div>
                  )}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
