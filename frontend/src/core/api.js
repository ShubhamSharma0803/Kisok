/**
 * Kiosk Vision API Client Module
 * Centralized HTTP request handlers for the FastAPI backend.
 */

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL !== undefined) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8000';
  }
  return '';
};

const API_BASE_URL = getApiBaseUrl();

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Common fetch wrapper with JSON handling & clean error management.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.detail || `Request failed with status ${response.status}`,
        response.status
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Unable to connect to the kiosk system. Please check your connection.', 0);
  }
}

/**
 * Helper: Safely reports friction/failed tap for user actions without any risk of recursion.
 */
async function safeReportFriction(sessionId) {
  if (!sessionId) return;
  try {
    await fetch(`${API_BASE_URL}/sessions/${sessionId}/failed-tap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    // Silently ignore if failed-tap fails — NO recursion risk
  }
}

/**
 * Session API Endpoints
 */

export async function createSession() {
  return request('/sessions', {
    method: 'POST',
  });
}

export async function getSession(sessionId) {
  return request(`/sessions/${sessionId}`, {
    method: 'GET',
  });
}

/**
 * Menu & Orders API Endpoints
 */

export async function getMenu() {
  return request('/menu', {
    method: 'GET',
  });
}

export const fetchMenu = getMenu;

export async function getOrder(sessionId) {
  return request(`/sessions/${sessionId}/orders`, {
    method: 'GET',
  });
}

export const getSessionOrders = getOrder;

// User-initiated action: reports friction if user's add attempt fails
export async function addOrderItem(sessionId, menuItemId, quantity = 1, modifiers = null) {
  try {
    return await request(`/sessions/${sessionId}/orders/items`, {
      method: 'POST',
      body: JSON.stringify({
        menu_item_id: menuItemId,
        quantity,
        modifiers,
      }),
    });
  } catch (err) {
    await safeReportFriction(sessionId);
    throw err;
  }
}

// User-initiated action: reports friction if user's update attempt fails
export async function updateOrderItemQuantity(sessionId, itemId, quantity) {
  try {
    return await request(`/sessions/${sessionId}/orders/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        quantity,
      }),
    });
  } catch (err) {
    await safeReportFriction(sessionId);
    throw err;
  }
}

// User-initiated action: reports friction if user's delete attempt fails
export async function deleteOrderItem(sessionId, itemId) {
  try {
    return await request(`/sessions/${sessionId}/orders/items/${itemId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    await safeReportFriction(sessionId);
    throw err;
  }
}

export async function confirmOrder(sessionId) {
  return request(`/sessions/${sessionId}/confirm-order`, {
    method: 'POST',
  });
}

export async function createPayment(sessionId) {
  return request(`/sessions/${sessionId}/create-payment`, {
    method: 'POST',
  });
}

/**
 * Handoff & Orchestrator API Endpoints
 */

export async function reportFailedTap(sessionId) {
  if (!sessionId) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/failed-tap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    // Silently ignore if failed-tap fails — NO recursion risk
    return null;
  }
}

export async function getOrchestratorState(sessionId) {
  return request(`/sessions/${sessionId}/orchestrator-state`, {
    method: 'GET',
  });
}

export async function triggerHandoff(sessionId) {
  return request(`/sessions/${sessionId}/handoff`, {
    method: 'POST',
  });
}

export async function resolveHandoff(sessionId) {
  return request(`/sessions/${sessionId}/resolve-handoff`, {
    method: 'POST',
  });
}

export async function narrateScreen(sessionId, screen, context = {}) {
  return request(`/sessions/${sessionId}/narrate`, {
    method: 'POST',
    body: JSON.stringify({ screen, context }),
  });
}

export async function triggerScreenNarration(sessionId, screen, context = {}) {
  try {
    const res = await narrateScreen(sessionId, screen, context);
    if (res?.tts_audio_b64) {
      const audio = new Audio(`data:audio/mp3;base64,${res.tts_audio_b64}`);
      audio.play().catch(() => { });
    }
    return res;
  } catch (err) {
    console.error('[ScreenNarration] Failed to fetch or play narration:', err);
    return null;
  }
}

/**
 * Voice Module API Endpoints
 */

export async function sendVoiceAudio(sessionId, audioBlob) {
  const url = `${API_BASE_URL}/sessions/${sessionId}/voice`;
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');

  // 15-second timeout — the real STT→LLM→TTS pipeline can take up to ~10s;
  // this gives comfortable headroom while still failing on truly hung requests.
  const VOICE_TIMEOUT_MS = 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId); // success path — cancel the timeout
    if (!response.ok) {
      throw new ApiError('Voice processing failed', response.status);
    }
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId); // error path — cancel the timeout so it can't fire stale

    if (error.name === 'AbortError') {
      await safeReportFriction(sessionId);
      throw new ApiError(
        'Voice processing took too long. Please try a shorter phrase or check your connection.',
        0
      );
    }
    await safeReportFriction(sessionId);
    throw new ApiError('Voice service currently unavailable. Please try again.', 0);
  }
}

export async function getVoiceCart(sessionId) {
  return request(`/sessions/${sessionId}/voice/cart`, {
    method: 'GET',
  });
}

export async function resetVoiceOrder(sessionId) {
  try {
    return await request(`/sessions/${sessionId}/voice/reset`, {
      method: 'POST',
    });
  } catch (err) {
    await safeReportFriction(sessionId);
    throw err;
  }
}
