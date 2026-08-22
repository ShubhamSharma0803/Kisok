import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './core/SessionContext';
import { HandoffProvider } from './core/HandoffProvider';
import { AirGestureProvider } from './core/AirGestureProvider';
import ScreenNarrationBridge from './core/ScreenNarrationBridge';
import SessionStart from './core/SessionStart';
import OrdersScreen from './orders/OrdersScreen';
import GazeScreen from './gaze/GazeScreen';
import LargeUIScreen from './orders/LargeUIScreen';
import ConfirmationScreen from './orders/ConfirmationScreen';
import PaymentScreen from './orders/PaymentScreen';
import ThankYouScreen from './orders/ThankYouScreen';
import VoiceScreen from './voice/VoiceScreen';
import ModeOverride from './components/ModeOverride';

/**
 * App Component with Outermost to Innermost Provider Architecture:
 * BrowserRouter -> SessionProvider -> HandoffProvider -> AirGestureProvider -> [ScreenNarrationBridge, ModeOverride] -> Routes
 */
export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <HandoffProvider>
          <AirGestureProvider>
            <ScreenNarrationBridge />
            <ModeOverride />
            <Routes>
              <Route path="/" element={<SessionStart />} />
              <Route path="/order" element={<OrdersScreen />} />
              <Route path="/voice" element={<VoiceScreen />} />
              <Route path="/gaze" element={<GazeScreen />} />
              <Route path="/large-ui" element={<LargeUIScreen />} />
              <Route path="/review" element={<ConfirmationScreen />} />
              <Route path="/payment" element={<PaymentScreen />} />
              <Route path="/thank-you" element={<ThankYouScreen />} />
            </Routes>
          </AirGestureProvider>
        </HandoffProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
