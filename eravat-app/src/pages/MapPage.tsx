import { MapComponent } from '../components/shared/MapComponent';
import { useLanguage } from '../contexts/LanguageContext';

export default function MapPage() {
    const { t } = useLanguage();
    return (
        <div className="flex flex-col gap-4 p-4 md:p-8">
            <div>
                <h1 className="text-xl font-extrabold tracking-tight">{t('map.pageTitle')}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{t('map.pageSubtitle')}</p>
            </div>
            <MapComponent />
        </div>
    );
}
