export interface SkillDef {
  id: string;
  name: string;
  description: string;
  category: string;
}

export const SKILLS: SkillDef[] = [
  // Communication
  { id: "whatsapp", name: "WhatsApp", description: "Send and receive messages, manage chats, and automate responses through WhatsApp", category: "Communication" },
  { id: "telegram", name: "Telegram", description: "Full bot integration - send messages, manage groups, handle files and media", category: "Communication" },
  { id: "discord", name: "Discord", description: "Manage servers, send messages, moderate channels, and automate Discord workflows", category: "Communication" },
  { id: "slack", name: "Slack", description: "Read and send messages, manage channels, search workspace history, and automate workflows", category: "Communication" },
  { id: "email", name: "Email", description: "Read, compose, and organize emails across Gmail and other IMAP providers", category: "Communication" },
  { id: "imessage", name: "iMessage", description: "Send and receive iMessages directly from your AI assistant", category: "Communication" },
  { id: "signal", name: "Signal", description: "Private and encrypted messaging through Signal", category: "Communication" },

  // Productivity & Notes
  { id: "calendar", name: "Calendar", description: "Create events, check your schedule, set reminders, and manage multiple calendars", category: "Productivity" },
  { id: "notion", name: "Notion", description: "Create and edit pages, query databases, manage your workspace, and organize knowledge", category: "Productivity" },
  { id: "obsidian", name: "Obsidian", description: "Read and write notes, search your vault, manage tags, and navigate linked knowledge", category: "Productivity" },
  { id: "trello", name: "Trello", description: "Create boards, manage cards, move tasks between lists, and track project progress", category: "Productivity" },
  { id: "apple-notes", name: "Apple Notes", description: "Create, search, and organize notes synced with iCloud", category: "Productivity" },
  { id: "apple-reminders", name: "Apple Reminders", description: "Create and manage reminders, lists, and due dates synced with iCloud", category: "Productivity" },
  { id: "bear-notes", name: "Bear Notes", description: "Write and organize notes with markdown, tags, and nested structures", category: "Productivity" },
  { id: "things", name: "Things 3", description: "Task management with projects, areas, tags, and due dates", category: "Productivity" },

  // Development
  { id: "github", name: "GitHub", description: "Browse repos, create issues, review PRs, manage branches, and automate dev workflows", category: "Development" },
  { id: "coding-agent", name: "Coding Agent", description: "Write, debug, and refactor code across multiple languages with AI assistance", category: "Development" },

  // Media & Entertainment
  { id: "spotify", name: "Spotify", description: "Control playback, search songs, manage playlists, and discover new music", category: "Media" },
  { id: "youtube", name: "YouTube", description: "Search videos, get transcripts, summarize content, and manage playlists", category: "Media" },

  // Smart Home
  { id: "hue", name: "Philips Hue", description: "Control lights, set scenes, adjust brightness and colors, and create automations", category: "Smart Home" },
  { id: "homekit", name: "HomeKit", description: "Control Apple Home devices, check sensor status, and trigger automations", category: "Smart Home" },

  // Utilities
  { id: "weather", name: "Weather", description: "Get current conditions, hourly and weekly forecasts, and severe weather alerts", category: "Utilities" },
  { id: "web-search", name: "Web Search", description: "Search the internet, get up-to-date information, and summarize web pages", category: "Utilities" },
  { id: "voice", name: "Voice Calls", description: "Make and receive voice calls, handle voicemail, and manage call routing", category: "Utilities" },
  { id: "1password", name: "1Password", description: "Securely access passwords, generate credentials, and manage vault items", category: "Utilities" },

  // AI & Advanced
  { id: "canvas", name: "Canvas", description: "Create diagrams, flowcharts, and visual content with AI generation", category: "AI & Advanced" },
  { id: "gemini", name: "Gemini", description: "Access Google Gemini models for multimodal reasoning and analysis", category: "AI & Advanced" },
  { id: "summarize", name: "Summarize", description: "Condense long articles, documents, and conversations into key points", category: "AI & Advanced" },
  { id: "video-frames", name: "Video Frames", description: "Extract and analyze frames from videos for visual understanding", category: "AI & Advanced" },
  { id: "image-gen", name: "Image Generation", description: "Generate images from text descriptions using AI models", category: "AI & Advanced" },
];

export const VALID_SKILL_IDS = new Set(SKILLS.map(s => s.id));

export const SKILL_LABELS: Record<string, string> = Object.fromEntries(
  SKILLS.map(s => [s.id, s.name])
);

export const SKILL_CATEGORIES = Array.from(new Set(SKILLS.map(s => s.category)));
