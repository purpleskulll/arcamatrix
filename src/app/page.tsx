"use client";

import { useState, useEffect, useRef } from "react";
import SkillSelector from "@/components/SkillSelector";
import PricingSummary from "@/components/PricingSummary";
import Hero from "@/components/Hero";
import Features from "@/components/Features";

export default function Home() {
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const skillsRef = useRef<HTMLElement>(null);

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

    const elements = skillsRef.current?.querySelectorAll(".scroll-fade");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-arca-darker/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-arca-primary to-arca-secondary rounded-lg"></div>
              <span className="text-xl font-bold">Arcamatrix</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="nav-link text-gray-300 hover:text-white transition">Features</a>
              <a href="#skills" className="nav-link text-gray-300 hover:text-white transition">Skills</a>
              <a href="#pricing" className="nav-link text-gray-300 hover:text-white transition">Pricing</a>
              <a href="/login" className="px-4 py-2 rounded-lg bg-arca-primary hover:bg-arca-secondary transition btn-hover">
                Login
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <Hero />

      {/* Features Section */}
      <Features />

      {/* Skills Selector Section */}
      <section ref={skillsRef} id="skills" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 scroll-fade">
            <h2 className="text-4xl font-bold mb-4">
              Build Your <span className="text-gradient-animate">Perfect Assistant</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Select the skills your AI assistant needs. Each skill adds powerful capabilities
              tailored to your workflow.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 scroll-fade" style={{ transitionDelay: "0.2s" }}>
            <div className="lg:col-span-2">
              <SkillSelector
                selectedSkills={selectedSkills}
                onSkillsChange={setSelectedSkills}
              />
            </div>
            <div className="lg:col-span-1">
              <PricingSummary selectedSkills={selectedSkills} />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-4">
        <div className="max-w-7xl mx-auto text-center text-gray-400">
          <p>&copy; 2026 Arcamatrix. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
