/** Device local date (YYYY-MM-DD) and 24h time (HH:mm) for report autofill. */
export function captureDeviceDateTime(now = new Date()): { date: string; time: string } {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const date = `${y}-${m}-${d}`;
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return { date, time };
}
