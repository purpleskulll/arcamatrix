"use client";

import { useEffect, useRef } from "react";

const features = [
  {
    icon: "🔌",
    title: "Connect Your Apps",
    description: "WhatsApp, Telegram, Discord, Slack, Email, Calendar - your assistant works where you work."
  },
  {
    icon: "🧠",
    title: "Learns Your Style",
    description: "The more you use it, the better it gets. Your preferences, your shortcuts, your way."
  },
  {
    icon: "🔒",
    title: "Private & Secure",
    description: "Your own isolated instance. Your data never trains other models. Full encryption."
  },
  {
    icon: "⚡",
    title: "Always Available",
    description: "Running 24/7 on dedicated infrastructure. No rate limits, no waiting."
  },
  {
    icon: "🎛️",
    title: "Fully Customizable",
    description: "Choose only the skills you need. Add or remove anytime. Pay for what you use."
  },
  {
    icon: "🚀",
    title: "Instant Setup",
    description: "Select your skills, pay, and your assistant is ready in minutes. No coding required."
  }
];

export default function Features() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = sectionRef.current?.querySelectorAll(".scroll-fade");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="features" className="py-20 px-4 bg-arca-darker/50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 scroll-fade">
          <h2 className="text-4xl font-bold mb-4">
            Why <span className="text-gradient-animate">Arcamatrix</span>?
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            A personal AI that actually works for you, not the other way around.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`scroll-fade p-6 rounded-2xl bg-white/5 border border-white/10 card-glow`}
              style={{ transitionDelay: `${index * 0.1}s` }}
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
