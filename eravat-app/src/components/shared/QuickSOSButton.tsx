import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';
import { db } from '../../db';
import { syncData } from '../../services/syncService';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import posthog from '../../lib/posthog';

export function QuickSOSButton() {
    const { profile } = useAuth();
    const { language } = useLanguage();
    const [status, setStatus] = useState<'idle' | 'locating' | 'saving' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');

    const getLocalizedText = () => {
        const text: Record<string, {
            buttonLabel: string;
            locating: string;
            saving: string;
            success: string;
            error: string;
            permissionDenied: string;
        }> = {
            en: {
                buttonLabel: 'Quick SOS Sighting',
                locating: 'Locating...',
                saving: 'Reporting...',
                success: 'SOS Logged & Syncing!',
                error: 'SOS Failed. Try again.',
                permissionDenied: 'Location permission denied.',
            },
            hi: {
                buttonLabel: 'त्वरित संकट (SOS)',
                locating: 'स्थान खोज रहे हैं...',
                saving: 'रिपोर्ट कर रहे हैं...',
                success: 'संकट दर्ज! सिंक हो रहा है...',
                error: 'संकट विफल। पुनः प्रयास करें।',
                permissionDenied: 'स्थान अनुमति अस्वीकृत।',
            },
            mr: {
                buttonLabel: 'त्वरित संकट (SOS)',
                locating: 'स्थान शोधत आहे...',
                saving: 'नोंदवत आहे...',
                success: 'संकट नोंदवले! सिंक होत आहे...',
                error: 'संकट नोंदणी अपयशी.',
                permissionDenied: 'स्थान परवानगी नाकारली.',
            }
        };
        const lang = (language || 'en').split('-')[0];
        return text[lang] || text.en;
    };

    const strings = getLocalizedText();

    const handleSOS = async () => {
        if (status !== 'idle' && status !== 'error' && status !== 'success') return;
        if (!profile?.id) {
            setStatus('error');
            setErrorMessage('User profile not loaded.');
            return;
        }

        setStatus('locating');
        setErrorMessage('');

        try {
            // Request permissions and get high accuracy geolocation
            const perm = await Geolocation.requestPermissions();
            if (perm.location === 'denied') {
                setStatus('error');
                setErrorMessage(strings.permissionDenied);
                return;
            }

            const position = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 10000,
            });

            setStatus('saving');

            const reportId = crypto.randomUUID();
            const now = new Date().toISOString();

            // Create flat emergency report
            await db.reports.add({
                id: reportId,
                user_id: profile.id,
                activity_date: now.split('T')[0],
                activity_time: now.split('T')[1].substring(0, 5),
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                observation_type: 'direct',
                total_elephants: 1,
                male_count: 0,
                female_count: 0,
                calf_count: 0,
                unknown_count: 1,
                indirect_sign_details: [],
                conflict_loss_details: [],
                loss_type: [],
                compass_bearing: null,
                photo_url: null,
                notes: 'EMERGENCY QUICK SOS - One-click GPS sighting alert.',
                division_id: profile.division_id || null,
                range_id: profile.range_id || null,
                beat_id: profile.beat_id || null,
                device_timestamp: now,
                sync_status: 'pending',
                status: 'submitted',
                obs_id: crypto.randomUUID(),
            });

            posthog.capture('sos_sighting_submitted');
            setStatus('success');

            // Trigger immediate background sync
            Network.getStatus().then(net => {
                if (net.connected) {
                    void syncData().catch(console.error);
                }
            });

            // Revert back to idle after 3 seconds
            setTimeout(() => {
                setStatus('idle');
            }, 3000);

        } catch (err) {
            console.error('SOS Sighting failed:', err);
            setStatus('error');
            setErrorMessage(err instanceof Error ? err.message : 'Error capturing location.');
            setTimeout(() => {
                setStatus('idle');
            }, 4000);
        }
    };

    const statusColors = {
        idle: 'bg-gradient-to-br from-destructive to-rose-600 hover:shadow-destructive/40 active:scale-95 shadow-destructive/20 border-destructive/20',
        locating: 'bg-amber-500 shadow-amber-500/20 border-amber-500/20',
        saving: 'bg-blue-600 shadow-blue-600/20 border-blue-600/20 animate-pulse',
        success: 'bg-emerald-600 shadow-emerald-600/20 border-emerald-600/20',
        error: 'bg-destructive shadow-destructive/20 border-destructive/20',
    };

    return (
        <div className="w-full flex flex-col items-center gap-2">
            <motion.button
                type="button"
                onClick={handleSOS}
                disabled={status === 'locating' || status === 'saving'}
                className={`relative w-full overflow-hidden rounded-3xl p-6 text-left flex items-center justify-between min-h-24 border text-white font-bold transition-all duration-300 shadow-lg ${statusColors[status]}`}
            >
                {/* Pulse Glow Effect for Idle Status */}
                {status === 'idle' && (
                    <span className="absolute inset-0 w-full h-full bg-white/10 rounded-3xl animate-ping opacity-30 pointer-events-none scale-105" />
                )}

                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-2xl shrink-0">
                        {status === 'locating' || status === 'saving' ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <AlertOctagon className="w-6 h-6" />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xl tracking-tight">
                            {status === 'idle' && strings.buttonLabel}
                            {status === 'locating' && strings.locating}
                            {status === 'saving' && strings.saving}
                            {status === 'success' && strings.success}
                            {status === 'error' && strings.error}
                        </span>
                        <span className="text-xs opacity-80 font-normal mt-0.5">
                            {status === 'idle' && 'One-tap emergency GPS broadcast'}
                            {status === 'locating' && 'Querying satellites...'}
                            {status === 'saving' && 'Writing to local store...'}
                            {status === 'success' && 'Alert queued for transmission'}
                            {status === 'error' && (errorMessage || 'Check GPS permissions')}
                        </span>
                    </div>
                </div>
            </motion.button>
        </div>
    );
}
