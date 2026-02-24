import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, HelpCircle, ChevronDown, MessageCircle,
    Mail, BookOpen, Bug, Smartphone, MapPin, Bell, FileText,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface FAQItem {
    question: string;
    answer: string;
    icon: React.ElementType;
}

function FAQAccordion({ item, index }: { item: FAQItem; index: number }) {
    const [open, setOpen] = useState(false);
    const Icon = item.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + index * 0.04 }}
        >
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/20 transition-colors rounded-2xl"
            >
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                    <Icon size={16} />
                </div>
                <span className="flex-1 text-sm font-medium text-foreground leading-snug">{item.question}</span>
                <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}
                    className="text-muted-foreground shrink-0 mt-0.5">
                    <ChevronDown size={16} />
                </motion.div>
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <p className="text-sm text-muted-foreground leading-relaxed px-4 pb-4 pl-15">
                            {item.answer}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default function HelpSupport() {
    const navigate = useNavigate();
    const { t } = useLanguage();

    const faqs: FAQItem[] = [
        {
            question: t('faq_submit_report_q'),
            answer: t('faq_submit_report_a'),
            icon: FileText,
        },
        {
            question: t('faq_no_internet_q'),
            answer: t('faq_no_internet_a'),
            icon: Smartphone,
        },
        {
            question: t('faq_location_q'),
            answer: t('faq_location_a'),
            icon: MapPin,
        },
        {
            question: t('faq_proximity_q'),
            answer: t('faq_proximity_a'),
            icon: Bell,
        },
        {
            question: t('faq_territory_q'),
            answer: t('faq_territory_a'),
            icon: MapPin,
        },
        {
            question: t('faq_bug_q'),
            answer: t('faq_bug_a'),
            icon: Bug,
        },
    ];

    return (
        <div className="min-h-screen p-6 space-y-6 max-w-lg mx-auto">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3">
                <button onClick={() => navigate('/profile')}
                    className="w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center text-foreground hover:bg-muted transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t('help_support')}</h1>
                    <p className="text-sm text-muted-foreground">{t('find_answers')}</p>
                </div>
            </motion.div>

            {/* FAQ Section */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
                className="glass-card rounded-3xl p-4 space-y-1">

                <div className="flex items-center gap-3 p-2 pb-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <BookOpen size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('faq_title')}</h2>
                        <p className="text-xs text-muted-foreground">{t('tap_to_expand')}</p>
                    </div>
                </div>

                <div className="divide-y divide-border/30">
                    {faqs.map((faq, i) => (
                        <FAQAccordion key={i} item={faq} index={i} />
                    ))}
                </div>
            </motion.div>

            {/* Contact Section */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
                className="glass-card rounded-3xl p-6 space-y-4">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <MessageCircle size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('contact_us')}</h2>
                        <p className="text-xs text-muted-foreground">{t('need_more_help')}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <a href="mailto:support@eravat.org"
                        className="flex items-center gap-3 p-4 bg-muted/30 rounded-2xl border border-border/30 hover:bg-muted/50 transition-colors">
                        <Mail size={18} className="text-primary shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{t('email_support')}</p>
                            <p className="text-sm font-medium text-foreground">support@eravat.org</p>
                        </div>
                    </a>
                </div>
            </motion.div>

            {/* App Info */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
                className="glass-card rounded-3xl p-6 space-y-4">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <HelpCircle size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('about_eravat')}</h2>
                        <p className="text-xs text-muted-foreground">{t('app_information')}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center p-4 bg-muted/30 rounded-2xl border border-border/30">
                        <span className="text-sm text-muted-foreground">{t('version')}</span>
                        <span className="text-sm font-medium text-foreground">2.0.0</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-muted/30 rounded-2xl border border-border/30">
                        <span className="text-sm text-muted-foreground">{t('platform')}</span>
                        <span className="text-sm font-medium text-foreground">Web / Android</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-muted/30 rounded-2xl border border-border/30">
                        <span className="text-sm text-muted-foreground">{t('backend')}</span>
                        <span className="text-sm font-medium text-foreground">Supabase</span>
                    </div>
                </div>

                <p className="text-xs text-center text-muted-foreground pt-2">
                    {t('eravat_tagline')}
                </p>
            </motion.div>
        </div>
    );
}
