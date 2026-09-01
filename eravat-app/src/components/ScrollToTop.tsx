import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Reset window (and marked) scroll containers on every route change. */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    document.querySelectorAll<HTMLElement>('[data-scroll-reset]').forEach((el) => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
  }, [pathname]);

  return null;
}
