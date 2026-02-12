"use client";

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
}

const skills: Skill[] = [
  // Communication
  { id: "whatsapp", name: "WhatsApp", description: "Send and receive messages, manage chats, and automate responses through WhatsApp", category: "Communication" },
  { id: "telegram", name: "Telegram", description: "Full bot integration - send messages, manage groups, handle files and media", category: "Communication" },
  { id: "discord", name: "Discord", description: "Manage servers, send messages, moderate channels, and automate Discord workflows", category: "Communication" },
  { id: "slack", name: "Slack", description: "Read and send messages, manage channels, search workspace history, and automate workflows", category: "Communication" },
  { id: "email", name: "Email", description: "Read, compose, and organize emails across Gmail and other IMAP providers", category: "Communication" },
  { id: "imessage", name: "iMessage", description: "Send and receive iMessages directly from your AI assistant", category: "Communication" },
  { id: "signal", name: "Signal", description: "Private and encrypted messaging through Signal", category: "Communication" },

  // Productivity
  { id: "calendar", name: "Calendar", description: "Create events, check your schedule, set reminders, and manage multiple calendars", category: "Productivity" },
  { id: "notion", name: "Notion", description: "Create and edit pages, query databases, manage your workspace, and organize knowledge", category: "Productivity" },
  { id: "obsidian", name: "Obsidian", description: "Read and write notes, search your vault, manage tags, and navigate linked knowledge", category: "Productivity" },
  { id: "trello", name: "Trello", description: "Create boards, manage cards, move tasks between lists, and track project progress", category: "Productivity" },
  { id: "github", name: "GitHub", description: "Browse repos, create issues, review PRs, manage branches, and automate dev workflows", category: "Development" },

  // Media & Entertainment
  { id: "spotify", name: "Spotify", description: "Control playback, search songs, manage playlists, and discover new music", category: "Media" },
  { id: "youtube", name: "YouTube", description: "Search videos, get transcripts, summarize content, and manage playlists", category: "Media" },

  // Smart Home
  { id: "hue", name: "Philips Hue", description: "Control lights, set scenes, adjust brightness and colors, and create automations", category: "Smart Home" },
  { id: "homekit", name: "HomeKit", description: "Control Apple Home devices, check sensor status, and trigger automations", category: "Smart Home" },

  // Utilities
  { id: "weather", name: "Weather", description: "Get current conditions, hourly and weekly forecasts, and severe weather alerts for any location", category: "Utilities" },
  { id: "web-search", name: "Web Search", description: "Search the internet, get up-to-date information, and summarize web pages", category: "Utilities" },
  { id: "voice", name: "Voice Calls", description: "Make and receive voice calls, handle voicemail, and manage call routing", category: "Utilities" },
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
      <div className="text-center mb-2">
        <span className="inline-block px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-sm font-medium">
          All skills included free with your subscription
        </span>
      </div>
      {categories.map(category => (
        <div key={category}>
          <h3 className="text-lg font-semibold text-gray-300 mb-4">{category}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
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
                    <div>
                      <div className="font-semibold">{skill.name}</div>
                      <div className="text-sm text-gray-400 mt-0.5">{skill.description}</div>
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      {selectedSkills.includes(skill.id) ? (
                        <span className="text-xs font-medium text-arca-primary">&#10003; Added</span>
                      ) : (
                        <span className="text-xs text-green-400/70">Free</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
