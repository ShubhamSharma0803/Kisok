import React, { useEffect, useRef, useCallback } from 'react';
import './CinematicIntro.css';

export default function CinematicIntro({ onComplete }) {
  const hasCompleted = useRef(false);
  const timerRef = useRef(null);

  const finish = useCallback(() => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;
    clearTimeout(timerRef.current);
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    // Respect reduced-motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }

    // Animation is 5 seconds. We wait 6 seconds to naturally finish
    // then call finish()
    timerRef.current = setTimeout(finish, 6000);

    return () => clearTimeout(timerRef.current);
  }, [finish]);

  if (hasCompleted.current) return null;

  return (
    <div className="cinematic-intro-wrapper" role="status" aria-label="Kiosk Vision AI is starting">
      <div className="cinematic-scene">
        <div className="scene-blob scene-blob-1"></div>
        <div className="scene-blob scene-blob-2"></div>
        
        <div className="items-container items-fade-out">
          <img src="/assets/pizza_flying.png" className="food-item item-1" alt="pizza" />
          <img src="/assets/fries_flying.png" className="food-item item-2" alt="fries" />
          <img src="/assets/donut_flying.png" className="food-item item-3" alt="donut" />
          <img src="/assets/pizza_flying.png" className="food-item item-4" alt="pizza2" style={{ transform: 'scaleX(-1)' }} />
          <img src="/assets/sandwich_flying.png" className="food-item item-5" alt="sandwich" />
          <img src="/assets/drink_flying.png" className="food-item item-6" alt="drink" />
        </div>

        <div className="scene-pulse"></div>

        <img src="/assets/burger_hero.png" className="hero-burger" alt="burger" />

        <div className="glass-panel"></div>
        <div className="ui-text-container">
          <h1>ORDER YOUR FOOD</h1>
          <h2>AI-POWERED ACCESSIBLE ORDERING</h2>
        </div>
      </div>

      <button
        type="button"
        onClick={finish}
        aria-label="Skip intro animation"
        className="skip-btn"
      >
        Skip
      </button>
    </div>
  );
}
