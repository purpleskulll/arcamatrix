"use client";

import { useEffect, useRef } from "react";

export default function Hero() {
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
    <section ref={sectionRef} className="pt-32 pb-20 px-4 relative overflow-hidden">
      <div className="max-w-7xl mx-auto text-center">
        {/* Glowing orb background effect */}
        <div className="absolute top-1/4 left-1/2 w-96 h-96 bg-arca-primary/20 rounded-full blur-3xl pointer-events-none hero-orb"></div>

        {/* Secondary floating orb */}
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-arca-secondary/10 rounded-full blur-3xl pointer-events-none hero-float-slow"></div>

        <div className="relative">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 fade-in-up">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
            <span className="text-sm text-gray-300">Now available in Beta</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight fade-in-up delay-200 hero-float-slow">
            Your AI Assistant,
            <br />
            <span className="text-gradient-animate">
              Your Rules
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 fade-in-up delay-400">
            Arcamatrix gives you a personal AI assistant that connects to your apps,
            automates your workflows, and learns your preferences.
            Pick the skills you need, pay only for what you use.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center fade-in-up delay-500">
            <a
              href="#skills"
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-arca-primary to-arca-secondary text-lg font-semibold glow btn-hover"
            >
              Build Your Assistant
            </a>
            <a
              href="#features"
              className="px-8 py-4 rounded-xl border border-white/20 hover:bg-white/5 text-lg font-semibold btn-hover-secondary"
            >
              See How It Works
            </a>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-3 gap-8 max-w-3xl mx-auto scroll-fade">
            <div className="stat-animate delay-100">
              <div className="text-3xl font-bold text-arca-primary">50+</div>
              <div className="text-gray-400">Skills Available</div>
            </div>
            <div className="stat-animate delay-300">
              <div className="text-3xl font-bold text-arca-primary">24/7</div>
              <div className="text-gray-400">Always Online</div>
            </div>
            <div className="stat-animate delay-500">
              <div className="text-3xl font-bold text-arca-primary">100%</div>
              <div className="text-gray-400">Your Data, Your Control</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
