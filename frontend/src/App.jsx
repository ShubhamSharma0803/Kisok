import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { SessionProvider, useSession } from './core/SessionContext';
import { HandoffProvider } from './core/HandoffProvider';
import SessionStart from './core/SessionStart';
import OrdersScreen from './orders/OrdersScreen';
import BigIconScreen from './orders/BigIconScreen';
import ConfirmationScreen from './orders/ConfirmationScreen';
import PaymentScreen from './orders/PaymentScreen';
import ThankYouScreen from './orders/ThankYouScreen';
import VoiceScreen from './voice/VoiceScreen';
import LargeUIScreen from './orders/LargeUIScreen';
import IntroVideo from './components/IntroVideo';
import { Eye, ShoppingCart, ArrowLeft } from 'lucide-react';

/**
 * Placeholder screen for Gaze Mode (/gaze)
 */
function GazeActivePlaceholder() {
  const navigate = useNavigate();
  const { sessionId } = useSession();

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-center space-y-6">
      <div className="p-10 rounded-3xl bg-slate-900 border-4 border-purple-500 max-w-xl w-full space-y-6 shadow-2xl">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-purple-950 border-2 border-purple-400 flex items-center justify-center text-purple-400">
          <Eye className="w-12 h-12 stroke-[2.5]" />
        </div>
        
        <span className="inline-block px-4 py-1.5 rounded-full bg-purple-950 text-purple-300 text-sm font-bold uppercase tracking-wider">
          Placeholder Route
        </span>
        
        <h1 className="text-4xl font-black text-white">Gaze Tracking Mode</h1>
        
        <p className="text-xl text-slate-300 font-medium">
          Dwell-selection camera calibration. Look at targets on screen to select without touching.
        </p>

        <p className="text-sm font-mono text-slate-500">Session ID: {sessionId || 'Not initialized'}</p>

        <div className="pt-4 flex flex-col sm:flex-row gap-4">
          <button
            type="button"
            onClick={() => navigate('/order')}
            className="flex-1 px-6 min-h-touch text-xl font-extrabold bg-purple-600 hover:bg-purple-500 text-white rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-400 min-h-touch shadow-lg transition-all"
          >
            View Menu Grid
          </button>
          
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-6 min-h-touch text-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-slate-500 min-h-touch"
          >
            Back to Start
          </button>
        </div>
      </div>
    </main>
  );
}

/**
 * App Component with Outermost to Innermost Provider Architecture:
 * BrowserRouter -> SessionProvider -> HandoffProvider -> Routes
 */
export default function App() {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <BrowserRouter>
      <SessionProvider>
        <HandoffProvider>
          {showIntro && (
            <IntroVideo onComplete={() => setShowIntro(false)} />
          )}
          <Routes>
            <Route path="/" element={<SessionStart />} />
            <Route path="/order" element={<OrdersScreen />} />
            <Route path="/voice" element={<VoiceScreen />} />
            <Route path="/gaze" element={<GazeActivePlaceholder />} />
            <Route path="/large-ui" element={<LargeUIScreen />} />
            <Route path="/review" element={<ConfirmationScreen />} />
            <Route path="/payment" element={<PaymentScreen />} />
            <Route path="/thank-you" element={<ThankYouScreen />} />
          </Routes>
        </HandoffProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
