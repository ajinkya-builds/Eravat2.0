import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            <div className="sticky top-0 z-40 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">Privacy Policy</h1>
            </div>
            <div className="p-6 max-w-lg mx-auto space-y-6 text-foreground">
                <div className="glass-card rounded-3xl p-6 border border-border/50 space-y-5">

                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Last Updated: February 2026. <br />
                        This Privacy Policy outlines how the Eravat Wild Elephant Monitoring System collects and limits the use of your data.
                    </p>

                    <div>
                        <h2 className="font-bold text-base mb-1">1. Data Collection</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">We collect precise location data, activity reports, and basic profile information to facilitate wildlife monitoring and ensure rapid response for user safety.</p>
                    </div>

                    <div>
                        <h2 className="font-bold text-base mb-1">2. Data Usage</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">Information gathered is strictly used for conservation efforts, human-wildlife conflict mitigation, and providing analytics to forest department officials.</p>
                    </div>

                    <div>
                        <h2 className="font-bold text-base mb-1">3. Data Sharing</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">Personal data is never sold to third parties. Anonymized spatial reports may be shared with scientific researchers and conservation authorities.</p>
                    </div>

                    <div>
                        <h2 className="font-bold text-base mb-1">4. Your Rights</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">You have the right to request deletion of your account and associated personal data at any time by contacting the system administrator.</p>
                    </div>

                </div>
            </div>
        </div>
    );
}
