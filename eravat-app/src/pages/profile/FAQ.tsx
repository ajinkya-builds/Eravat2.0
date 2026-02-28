import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';

export default function FAQ() {
    const navigate = useNavigate();
    const { t } = useLanguage();

    const faqs = [
        { q: t('faq.q1'), a: t('faq.a1') },
        { q: t('faq.q2'), a: t('faq.a2') },
        { q: t('faq.q3'), a: t('faq.a3') },
        { q: t('faq.q4'), a: t('faq.a4') }
    ];

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            <div className="sticky top-0 z-40 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">{t('faq.title')}</h1>
            </div>
            <div className="p-6 max-w-lg mx-auto space-y-4">
                {faqs.map((faq, index) => (
                    <div key={index} className="glass-card rounded-2xl p-5 border border-border/50">
                        <h3 className="font-bold text-foreground mb-2">{faq.q}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
