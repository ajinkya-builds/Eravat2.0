import { motion } from 'framer-motion';
import { Camera, X, RefreshCw, ImageIcon } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useCamera } from '../../../hooks/useCamera';

export function PhotoStep() {
    const { formData, updateFormData } = useActivityForm();
    const { takePhoto, isCapturing: loading, error } = useCamera();

    const handleCapture = async () => {
        const result = await takePhoto();
        if (result) {
            updateFormData({ photo_url: result.dataUrl });
        }
    };

    const handleClear = () => updateFormData({ photo_url: null });

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="text-center space-y-2">
                <h3 className="font-semibold text-foreground">Photo Evidence</h3>
                <p className="text-xs text-muted-foreground">Optional — attach a photo of the sighting or evidence</p>
            </div>

            {formData.photo_url ? (
                <div className="relative">
                    <img
                        src={formData.photo_url}
                        alt="Captured evidence"
                        className="w-full rounded-2xl object-cover max-h-80 border border-border"
                    />
                    <div className="absolute top-2 right-2 flex gap-2">
                        <button
                            type="button"
                            onClick={handleCapture}
                            disabled={loading}
                            className="p-2 rounded-xl bg-black/50 text-white hover:bg-black/70 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-2 rounded-xl bg-black/50 text-white hover:bg-destructive transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-xs text-emerald-600 mt-2 text-center">✓ Photo captured and stored locally</p>
                </div>
            ) : (
                <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-4 border-2 border-dashed border-border">
                    <div className="p-4 rounded-full bg-muted">
                        <ImageIcon className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-foreground mb-1">No photo attached</p>
                        <p className="text-xs text-muted-foreground">Photo is optional but helps verify the report</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleCapture}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        <Camera className="w-4 h-4" />
                        {loading ? 'Opening Camera...' : 'Take Photo'}
                    </button>
                    {error && <p className="text-xs text-destructive">⚠ {error}</p>}
                </div>
            )}
        </motion.div>
    );
}
