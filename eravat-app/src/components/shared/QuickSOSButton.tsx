import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertOctagon, Loader2, MapPin, Check, X } from 'lucide-react';
import { Network } from '@capacitor/network';
import { db } from '../../db';
import { syncData } from '../../services/syncService';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import { track } from '../../lib/analytics';
import { formatLatLngDms } from '../../lib/geoFormat';
import { lookupGeoFromPoint, type GeoMatch } from '../../lib/geoLookup';

export function QuickSOSButton() {
    const { profile } = useAuth();
    const { language } = useLanguage();
    const { fetchLocation } = useGeolocation();
    const [status, setStatus] = useState<'idle' | 'locating' | 'confirm' | 'saving' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [geoMatch, setGeoMatch] = useState<GeoMatch | null>(null);

    const getLocalizedText = () => {
        const text: Record<string, {
            buttonLabel: string;
            locating: string;
            saving: string;
            success: string;
            error: string;
            permissionDenied: string;
            confirmTitle: string;
            confirmDesc: string;
            latitude: string;
            longitude: string;
            dms: string;
            division: string;
            range: string;
            beat: string;
            confirm: string;
            cancel: string;
            idleHint: string;
            locatingHint: string;
            confirmHint: string;
            savingHint: string;
            successHint: string;
            errorHint: string;
        }> = {
            en: {
                buttonLabel: 'Quick SOS Sighting',
                locating: 'Locating...',
                saving: 'Reporting...',
                success: 'SOS Logged & Syncing!',
                error: 'SOS Failed. Try again.',
                permissionDenied: 'Location permission denied.',
                confirmTitle: 'Confirm SOS Sighting',
                confirmDesc: 'Check Division, Range, Beat and GPS below before sending. Location cannot be edited.',
                latitude: 'Latitude',
                longitude: 'Longitude',
                dms: 'GPS (DMS)',
                division: 'Division',
                range: 'Range',
                beat: 'Beat',
                confirm: 'Send SOS',
                cancel: 'Cancel',
                idleHint: 'One-tap emergency GPS broadcast',
                locatingHint: 'Querying satellites...',
                confirmHint: 'Confirm the location to send',
                savingHint: 'Writing to local store...',
                successHint: 'Alert queued for transmission',
                errorHint: 'Check GPS permissions',
            },
            hi: {
                buttonLabel: 'त्वरित संकट (SOS)',
                locating: 'स्थान खोज रहे हैं...',
                saving: 'रिपोर्ट कर रहे हैं...',
                success: 'संकट दर्ज! सिंक हो रहा है...',
                error: 'संकट विफल। पुनः प्रयास करें।',
                permissionDenied: 'स्थान अनुमति अस्वीकृत।',
                confirmTitle: 'संकट सूचना की पुष्टि करें',
                confirmDesc: 'भेजने से पहले नीचे डिवीज़न, रेंज, बीट और GPS जाँचें। स्थान संपादित नहीं किया जा सकता।',
                latitude: 'अक्षांश',
                longitude: 'देशांतर',
                dms: 'GPS (DMS)',
                division: 'डिवीज़न',
                range: 'रेंज',
                beat: 'बीट',
                confirm: 'SOS भेजें',
                cancel: 'रद्द करें',
                idleHint: 'एक टैप आपातकालीन GPS प्रसारण',
                locatingHint: 'उपग्रह से स्थान ले रहे हैं...',
                confirmHint: 'भेजने के लिए स्थान की पुष्टि करें',
                savingHint: 'स्थानीय रूप से सहेज रहे हैं...',
                successHint: 'अलर्ट भेजने के लिए कतार में है',
                errorHint: 'GPS अनुमति जाँचें',
            },
            mr: {
                buttonLabel: 'त्वरित संकट (SOS)',
                locating: 'स्थान शोधत आहे...',
                saving: 'नोंदवत आहे...',
                success: 'संकट नोंदवले! सिंक होत आहे...',
                error: 'संकट नोंदणी अपयशी.',
                permissionDenied: 'स्थान परवानगी नाकारली.',
                confirmTitle: 'संकट सूचना निश्चित करा',
                confirmDesc: 'पाठवण्यापूर्वी खालील डिव्हिजन, रेंज, बीट आणि GPS तपासा. स्थान संपादित करता येत नाही.',
                latitude: 'अक्षांश',
                longitude: 'रेखांश',
                dms: 'GPS (DMS)',
                division: 'डिव्हिजन',
                range: 'रेंज',
                beat: 'बीट',
                confirm: 'SOS पाठवा',
                cancel: 'रद्द करा',
                idleHint: 'एक टॅप आपत्कालीन GPS प्रसारण',
                locatingHint: 'उपग्रहाकडून स्थान घेत आहे...',
                confirmHint: 'पाठवण्यासाठी स्थान निश्चित करा',
                savingHint: 'स्थानिक स्तरावर जतन होत आहे...',
                successHint: 'अलर्ट पाठवण्यासाठी रांगेत आहे',
                errorHint: 'GPS परवानगी तपासा',
            }
        };
        const lang = (language || 'en').split('-')[0];
        return text[lang] || text.en;
    };

    const strings = getLocalizedText();

    // Step 1: capture location, then show a confirmation dialog (do NOT upload yet).
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
            // Shared hook: Capacitor Geolocation on native, browser API on web
            // (Capacitor's requestPermissions is "Not implemented on web").
            const position = await fetchLocation();
            if (!position?.coords) {
                setStatus('error');
                setErrorMessage(strings.permissionDenied);
                setTimeout(() => setStatus('idle'), 4000);
                return;
            }

            setCoords({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
            });
            const match = await lookupGeoFromPoint(position.coords.latitude, position.coords.longitude);
            setGeoMatch(match);
            setStatus('confirm');
        } catch (err) {
            console.error('SOS location failed:', err);
            setStatus('error');
            setErrorMessage(err instanceof Error ? err.message : 'Error capturing location.');
            setTimeout(() => setStatus('idle'), 4000);
        }
    };

    // Step 2: after the user confirms (and optionally edits GPS), persist + sync.
    const confirmAndSend = async () => {
        if (!profile?.id || !coords) return;
        if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
            setStatus('error');
            setErrorMessage('Invalid coordinates.');
            return;
        }

        setStatus('saving');
        try {
            const reportId = crypto.randomUUID();
            const now = new Date().toISOString();

            await db.reports.add({
                id: reportId,
                user_id: profile.id,
                activity_date: now.split('T')[0],
                activity_time: now.split('T')[1].substring(0, 5),
                latitude: coords.latitude,
                longitude: coords.longitude,
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
                division_id: geoMatch?.division_id || profile.division_id || null,
                range_id: geoMatch?.range_id || profile.range_id || null,
                beat_id: geoMatch?.beat_id || profile.beat_id || null,
                device_timestamp: now,
                sync_status: 'pending',
                status: 'submitted',
                obs_id: crypto.randomUUID(),
            });

            track('sos_sighting_submitted');
            setStatus('success');

            Network.getStatus().then(net => {
                if (net.connected) {
                    void syncData().catch(console.error);
                }
            });

            setTimeout(() => {
                setStatus('idle');
                setCoords(null);
                setGeoMatch(null);
            }, 3000);
        } catch (err) {
            console.error('SOS Sighting failed:', err);
            setStatus('error');
            setErrorMessage(err instanceof Error ? err.message : 'Error saving report.');
            setTimeout(() => setStatus('idle'), 4000);
        }
    };

    const cancelConfirm = () => {
        setStatus('idle');
        setCoords(null);
        setGeoMatch(null);
    };

    const statusColors = {
        idle: 'bg-gradient-to-br from-destructive to-rose-600 hover:shadow-destructive/40 active:scale-95 shadow-destructive/20 border-destructive/20',
        locating: 'bg-amber-500 shadow-amber-500/20 border-amber-500/20',
        confirm: 'bg-gradient-to-br from-destructive to-rose-600 shadow-destructive/20 border-destructive/20',
        saving: 'bg-blue-600 shadow-blue-600/20 border-blue-600/20 animate-pulse',
        success: 'bg-emerald-600 shadow-emerald-600/20 border-emerald-600/20',
        error: 'bg-destructive shadow-destructive/20 border-destructive/20',
    };

    return (
        <div className="w-full flex flex-col items-center gap-2">
            <motion.button
                type="button"
                onClick={handleSOS}
                disabled={status === 'locating' || status === 'saving' || status === 'confirm'}
                className={`relative w-full overflow-hidden rounded-3xl p-6 text-left flex items-center justify-between min-h-24 border text-white font-bold transition-all duration-300 shadow-lg ${statusColors[status]}`}
            >
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
                            {status === 'confirm' && strings.buttonLabel}
                            {status === 'saving' && strings.saving}
                            {status === 'success' && strings.success}
                            {status === 'error' && strings.error}
                        </span>
                        <span className="text-xs opacity-80 font-normal mt-0.5">
                            {status === 'idle' && strings.idleHint}
                            {status === 'locating' && strings.locatingHint}
                            {status === 'confirm' && strings.confirmHint}
                            {status === 'saving' && strings.savingHint}
                            {status === 'success' && strings.successHint}
                            {status === 'error' && (errorMessage || strings.errorHint)}
                        </span>
                    </div>
                </div>
            </motion.button>

            {/* Confirmation dialog — prevents accidental one-tap uploads (review §7).
                Rendered via a portal so `fixed` positioning is relative to the
                viewport and not trapped by transformed ancestors (framer-motion). */}
            {createPortal(
                <AnimatePresence>
                {status === 'confirm' && coords && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                        onClick={cancelConfirm}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm glass-card rounded-3xl border border-border p-6 space-y-4 bg-background max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-2xl bg-destructive/10 text-destructive">
                                    <AlertOctagon size={22} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">{strings.confirmTitle}</h3>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{strings.confirmDesc}</p>

                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">{strings.dms}</label>
                                <div className="w-full p-2.5 rounded-xl bg-muted/40 border border-border text-xs font-mono">
                                    {formatLatLngDms(coords.latitude, coords.longitude)}
                                </div>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <MapPin size={12} />
                                    {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1 text-xs">
                                <p><span className="text-muted-foreground">{strings.division}:</span> {geoMatch?.division_name || profile?.division_name || '—'}</p>
                                <p><span className="text-muted-foreground">{strings.range}:</span> {geoMatch?.range_name || profile?.range_name || '—'}</p>
                                <p><span className="text-muted-foreground">{strings.beat}:</span> {geoMatch?.beat_name || profile?.beat_name || '—'}</p>
                            </div>

                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={cancelConfirm}
                                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/50 flex items-center justify-center gap-1.5"
                                >
                                    <X size={16} /> {strings.cancel}
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmAndSend}
                                    className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:opacity-90 flex items-center justify-center gap-1.5"
                                >
                                    <Check size={16} /> {strings.confirm}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}
