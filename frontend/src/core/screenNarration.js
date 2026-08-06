/**
 * Maps React Router paths to narrate API screen values.
 * OrdersScreen registers live menu context (category/count) via setNarrationContext.
 */

let _liveContext = {};

export function setNarrationContext(context) {
  _liveContext = context || {};
}

export function getNarrationForRoute(pathname) {
  if (pathname === '/') {
    return { screen: 'start', context: {} };
  }
  if (pathname === '/order' || pathname === '/voice') {
    return { screen: 'menu', context: { ..._liveContext } };
  }
  if (pathname === '/gaze') {
    return { screen: 'menu', context: {} };
  }
  return { screen: 'start', context: {} };
}

export async function repeatNarrationForCurrentScreen(sessionId, pathname, isHandedOff) {
  const { triggerScreenNarration } = await import('./api');
  if (isHandedOff) {
    return triggerScreenNarration(sessionId, 'handoff');
  }
  const { screen, context } = getNarrationForRoute(pathname);
  return triggerScreenNarration(sessionId, screen, context);
}
