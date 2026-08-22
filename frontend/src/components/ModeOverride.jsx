import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession } from '../core/SessionContext';
import { updateDetection, updateChannel } from '../core/api';
import { Eye, Hand, Accessibility, ChevronDown } from 'lucide-react';

const MODE_OPTIONS = [
  {
    label: 'Touch',
    emphasis: 'standard_touch',
    route: '/order',
    icon: Hand,
    color: 'text-[#1f352d]',
    bg: 'bg-[#eef5e8]',
  },
  {
    label: 'Gaze',
    emphasis: 'gaze_active',
    route: '/gaze',
    icon: Eye,
    color: 'text-[#7b4a2f]',
    bg: 'bg-[#f3eadf]',
  },
  {
    label: 'Big Icons',
    emphasis: 'big_icons',
    route: '/large-ui',
    icon: Accessibility,
    color: 'text-[#8b4f2d]',
    bg: 'bg-[#fdf0e6]',
  },
];

// Routes where the mode override should NOT appear
const HIDDEN_ROUTES = ['/', '/payment', '/thank-you'];

export default function ModeOverride() {
  const navigate = useNavigate();
  const location = useLocation();
  const { uiEmphasis, setUiEmphasis, sessionId } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isHidden = HIDDEN_ROUTES.includes(location.pathname) || !sessionId;

  const current = MODE_OPTIONS.find((m) => m.emphasis === uiEmphasis) || MODE_OPTIONS[0];
  const CurrentIcon = current.icon;

  const handleSelect = async (option) => {
    if (sessionId) {
      try {
        await updateDetection(sessionId, option.emphasis, 1.0, 'manual_override', null);
        if (uiEmphasis === 'gaze_active' && option.emphasis !== 'gaze_active') {
          await updateChannel(sessionId, 'gaze_input', false);
        }
      } catch (err) {
        console.warn('[ModeOverride] Failed to persist manual override to DB:', err);
      }
    }
    setUiEmphasis(option.emphasis);
    setIsOpen(false);
    navigate(option.route);
  };

  // Click-away to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Don't render on splash/checkout routes or if no session
  if (isHidden) {
    return null;
  }

  return (
    <div ref={dropdownRef} className="fixed top-4 right-4 z-[55]">
      {/* Pill button */}
      <button
        type="button"
        data-dwell-id="mode:toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-[#e7dccd] bg-[#fffaf3]/95 px-4 py-2.5 shadow-[0_8px_24px_rgba(58,39,24,.10)] backdrop-blur transition-all hover:shadow-[0_12px_32px_rgba(58,39,24,.15)] active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-[#b66b3c]/20"
        aria-label="Change accessibility mode"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${current.bg}`}>
          <CurrentIcon className={`h-3.5 w-3.5 ${current.color}`} />
        </span>
        <span className="text-sm font-bold text-[#2b241f]">Mode: {current.label}</span>
        <ChevronDown
          className={`h-4 w-4 text-[#928274] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-[#e7dccd] bg-[#fffaf3] shadow-[0_20px_50px_rgba(58,39,24,.16)] backdrop-blur-sm"
          role="listbox"
          aria-label="Select accessibility mode"
        >
          <div className="px-4 py-3 border-b border-[#e7dccd]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a76538]">Switch mode</p>
          </div>
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = option.emphasis === uiEmphasis;

            return (
              <button
                key={option.emphasis}
                type="button"
                data-dwell-id={`mode:${option.emphasis}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(option)}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
                  isSelected ? 'bg-[#1f352d] text-white' : 'text-[#4f4036] hover:bg-[#f3eadf]'
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    isSelected ? 'bg-[#2d4d40] text-[#e9bd67]' : option.bg
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isSelected ? 'text-[#e9bd67]' : option.color}`} />
                </span>
                <div>
                  <p className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-[#2b241f]'}`}>
                    {option.label}
                  </p>
                  <p className={`text-xs font-medium ${isSelected ? 'text-white/70' : 'text-[#928274]'}`}>
                    {option.emphasis === 'standard_touch' && 'Tap to select items'}
                    {option.emphasis === 'gaze_active' && 'Look to select items'}
                    {option.emphasis === 'big_icons' && 'Large buttons & text'}
                  </p>
                </div>
                {isSelected && (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[#e9bd67]">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
