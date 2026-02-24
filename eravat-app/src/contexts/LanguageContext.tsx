import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import translations from '../i18n/translations';

// ─── Supported Languages ─────────────────────────────────────────────────────

export type Language = 'en' | 'hi' | 'mr';

export const LANGUAGES: { value: Language; label: string; native: string }[] = [
    { value: 'en', label: 'English', native: 'English' },
    { value: 'hi', label: 'Hindi', native: 'हिन्दी' },
    { value: 'mr', label: 'Marathi', native: 'मराठी' },
];

// ─── Context ─────────────────────────────────────────────────────────────────

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'eravat-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        return (localStorage.getItem(STORAGE_KEY) as Language) || 'en';
    });

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.lang = lang;
    };

    // Set initial lang attribute on mount
    useEffect(() => {
        document.documentElement.lang = language;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const t = useCallback(
        (key: string): string => translations[language]?.[key] ?? translations.en[key] ?? key,
        [language],
    );

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
    return ctx;
}
