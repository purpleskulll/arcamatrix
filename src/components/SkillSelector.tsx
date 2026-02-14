"use client";

import { SKILLS, SKILL_CATEGORIES } from "@/lib/skills";

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
      {SKILL_CATEGORIES.map(category => (
        <div key={category}>
          <h3 className="text-lg font-semibold text-gray-300 mb-4">{category}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {SKILLS
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
