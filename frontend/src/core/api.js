/**
 * Kiosk Vision API Client Module
 * Centralized HTTP request handlers for the FastAPI backend.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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

/**
 * Voice Module API Endpoints
 */

export async function sendVoiceAudio(sessionId, audioBlob) {
  const url = `${API_BASE_URL}/sessions/${sessionId}/voice`;
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new ApiError('Voice processing failed', response.status);
    }
    return await response.json();
  } catch (error) {
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
