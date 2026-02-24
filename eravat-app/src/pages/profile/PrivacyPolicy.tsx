import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function PrivacyPolicy() {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            <div className="sticky top-0 z-40 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">{t('privacyPolicy.title')}</h1>
            </div>
            <div className="p-6 max-w-lg mx-auto space-y-6 text-foreground">
                <div className="glass-card rounded-3xl p-6 border border-border/50 space-y-5">

                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {t('privacyPolicy.lastUpdated')} <br />
                        {t('privacyPolicy.intro')}
                    </p>

                    <div>
                        <h2 className="font-bold text-base mb-1">{t('privacyPolicy.dataColTitle')}</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">{t('privacyPolicy.dataColDesc')}</p>
                    </div>

                    <div>
                        <h2 className="font-bold text-base mb-1">{t('privacyPolicy.dataUseTitle')}</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">{t('privacyPolicy.dataUseDesc')}</p>
                    </div>

                    <div>
                        <h2 className="font-bold text-base mb-1">{t('privacyPolicy.dataShareTitle')}</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">{t('privacyPolicy.dataShareDesc')}</p>
                    </div>

                    <div>
                        <h2 className="font-bold text-base mb-1">{t('privacyPolicy.rightsTitle')}</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">{t('privacyPolicy.rightsDesc')}</p>
                    </div>

                </div>
            </div>
        </div>
    );
}
