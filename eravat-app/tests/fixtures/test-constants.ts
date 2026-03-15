export const FIELD_STAFF = {
    phone: '8899776655',
    password: 'pass123',
} as const;

export const ADMIN = {
    phone: '9988775566',
    password: 'P@ss123',
} as const;

/**
 * Switch the app language via the Settings page dropdown.
 * Works from any page — navigates to /settings, switches, then navigates back.
 */
export async function switchLanguage(
    page: import('@playwright/test').Page,
    lang: 'English' | 'Hindi' | 'Marathi',
) {
    await page.goto('/settings');
    // Open the custom language dropdown
    const langTrigger = page.locator('button').filter({ hasText: /English|Hindi|Marathi|अंग्रेज़ी|हिन्दी|मराठी|इंग्रजी/ }).first();
    await langTrigger.click();
    // Dropdown options contain both English label and native text
    await page.locator('button').filter({ hasText: new RegExp(lang) }).last().click();
    await page.waitForTimeout(500);
}

export const ROUTES = {
    login: '/login',
    dashboard: '/',
    report: '/report',
    profile: '/profile',
    editProfile: '/profile/edit',
    settings: '/settings',
    privacy: '/privacy',
    help: '/help',
    faq: '/faq',
    privacyPolicy: '/privacy-policy',
    history: '/history',
    map: '/map',
    admin: '/admin',
    adminUsers: '/admin/users',
    adminDivisions: '/admin/divisions',
    adminObservations: '/admin/observations',
    adminSettings: '/admin/settings',
} as const;
