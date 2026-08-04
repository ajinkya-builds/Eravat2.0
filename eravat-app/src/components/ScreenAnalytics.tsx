import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackScreen } from '../lib/analytics';

/** Fires app.screen_viewed on every route change. */
export function ScreenAnalytics() {
  const location = useLocation();

  useEffect(() => {
    trackScreen(location.pathname);
  }, [location.pathname]);

  return null;
}
