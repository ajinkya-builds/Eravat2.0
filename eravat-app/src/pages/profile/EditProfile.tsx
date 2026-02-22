import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, User, Phone, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabase';

export default function EditProfile() {
    const navigate = useNavigate();
    const { profile, refreshProfile } = useAuth();

    const [firstName, setFirstName] = useState(profile?.first_name || '');
    const [lastName, setLastName] = useState(profile?.last_name || '');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const initials = profile
        ? `${profile.first_name?.charAt(0) ?? ''}${profile.last_name?.charAt(0) ?? ''}`.toUpperCase() || 'U'
        : 'U';

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!profile?.id) return;

        setIsLoading(true);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', profile.id);

            if (error) throw error;

            await refreshProfile();
            setMessage({ type: 'success', text: 'Profile updated successfully.' });

            // Auto close after 2 seconds on success
            setTimeout(() => navigate(-1), 2000);

        } catch (error: any) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: error.message || 'Failed to update profile.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            {/* Header */}
            <div className="sticky top-0 z-40 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">Edit Profile</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-8">
                {/* Avatar Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-4"
                >
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-primary/30">
                        {initials}
                    </div>
                    <div className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                        {profile?.role ? profile.role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'User'}
                    </div>
                </motion.div>

                {message && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className={`p-4 rounded-xl text-sm font-medium ${message.type === 'success'
                                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                : 'bg-destructive/10 text-destructive border border-destructive/20'
                            }`}
                    >
                        {message.text}
                    </motion.div>
                )}

                {/* Edit Form */}
                <motion.form
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    onSubmit={handleSave}
                    className="space-y-6"
                >
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground ml-1">First Name</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full bg-white/50 dark:bg-black/20 border border-border rounded-xl py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                    placeholder="Enter first name"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground ml-1">Last Name</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="w-full bg-white/50 dark:bg-black/20 border border-border rounded-xl py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                    placeholder="Enter last name"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground ml-1">Phone Number</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <input
                                    type="text"
                                    disabled
                                    value={profile?.phone || 'Not provided'}
                                    className="w-full bg-muted/50 border border-border/50 rounded-xl py-3 pl-11 pr-10 text-sm text-muted-foreground cursor-not-allowed"
                                />
                                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                    <Lock className="h-4 w-4 text-muted-foreground/50" />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 ml-1 leading-relaxed">
                                Phone number is used for login and cannot be changed here. Contact an administrator if you need to update it.
                            </p>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || (firstName === profile?.first_name && lastName === profile?.last_name)}
                        className="w-full bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 mt-8 shadow-lg shadow-primary/25 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed group transition-all"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </motion.form>
            </div>
        </div>
    );
}
