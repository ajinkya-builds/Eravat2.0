import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

type ManifestUser = { role?: string; phone_app?: string; otp?: string };

const fixtureDir = dirname(fileURLToPath(import.meta.url));

let cachedManifest: ManifestUser[] | null = null;

function loadManifest(): ManifestUser[] {
    if (cachedManifest) return cachedManifest;
    const candidates = [
        process.env.E2E_OTP_MANIFEST,
        join(fixtureDir, '../../../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'),
    ].filter((p): p is string => Boolean(p));
    for (const path of candidates) {
        if (existsSync(path)) {
            cachedManifest = JSON.parse(readFileSync(path, 'utf8')) as ManifestUser[];
            return cachedManifest;
        }
    }
    cachedManifest = [];
    return cachedManifest;
}

/** OTP for Playwright login — UAT manifest first, then local seed test phones. */
export function otpForLogin(phone: string, roleFallback?: 'admin' | 'beat_guard'): string {
    const manifest = loadManifest();
    const byPhone = manifest.find((u) => u.phone_app === phone);
    if (byPhone?.otp) return byPhone.otp;
    if (roleFallback) {
        const byRole = manifest.find((u) => u.role === roleFallback);
        if (byRole?.otp) return byRole.otp;
    }
    if (phone === '8899776655' || phone === '9988775566') {
        return '123456';
    }
    return `48${phone.slice(-4)}`;
}
