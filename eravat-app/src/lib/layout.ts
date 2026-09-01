/** Offset under AppLayout's fixed header (`h-16` + safe-area). */
export const PAGE_STICKY_TOP =
  'top-[calc(4rem+env(safe-area-inset-top,0px))]';

/** Standard in-page sticky toolbar under the global ERAVAT header. */
export const PAGE_STICKY_HEADER =
  `sticky z-30 glass-effect border-b border-border/50 px-4 py-3 flex items-center gap-3 ${PAGE_STICKY_TOP}`;
