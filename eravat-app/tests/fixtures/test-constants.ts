/** Vite `base` in vite.config.ts — required for local dev and gh-pages. */
export const APP_BASE = '/Eravat2.0';

export const appPath = (path: string) =>
    `${APP_BASE}${path.startsWith('/') ? path : `/${path}`}`;

/** Navigate and wait until loading spinners clear. */
export async function gotoAndReady(
    page: import('@playwright/test').Page,
    path: string,
) {
    const { waitForAppReady } = await import('./app-ready');
    await page.goto(appPath(path));
    await waitForAppReady(page);
}

export const FIELD_STAFF = {
    phone: '8899776655',
} as const;

export const ADMIN = {
    phone: '9988775566',
} as const;

const LANG_VALUE: Record<'English' | 'Hindi' | 'Marathi', string> = {
    English: 'en',
    Hindi: 'hi',
    Marathi: 'mr',
};

/**
 * Switch language via Settings <select data-testid="language-select">.
 */
export async function switchLanguage(
    page: import('@playwright/test').Page,
    lang: 'English' | 'Hindi' | 'Marathi',
) {
    const { waitForAppReady } = await import('./app-ready');
    await page.goto(ROUTES.settings);
    await waitForAppReady(page);
    await page.getByTestId('language-select').selectOption(LANG_VALUE[lang]);
    await waitForAppReady(page);
}

export const ROUTES = {
    login: appPath('/login'),
    dashboard: appPath('/'),
    report: appPath('/report'),
    profile: appPath('/profile'),
    editProfile: appPath('/profile/edit'),
    settings: appPath('/settings'),
    privacy: appPath('/privacy'),
    help: appPath('/help'),
    faq: appPath('/faq'),
    privacyPolicy: appPath('/privacy-policy'),
    history: appPath('/history'),
    map: appPath('/map'),
    admin: appPath('/admin'),
    adminUsers: appPath('/admin/users'),
    adminDivisions: appPath('/admin/divisions'),
    adminObservations: appPath('/admin/observations'),
    adminSettings: appPath('/admin/settings'),
} as const;
