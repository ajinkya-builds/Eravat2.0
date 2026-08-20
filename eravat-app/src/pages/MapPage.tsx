import { MapComponent } from '../components/shared/MapComponent';
import { useLanguage } from '../contexts/LanguageContext';

export default function MapPage() {
    const { t } = useLanguage();
    return (
        <div className="flex flex-col gap-6 p-4 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{t('map.pageTitle')}</h1>
                    <p className="text-muted-foreground">{t('map.pageSubtitle')}</p>
                </div>
            </div>
            <MapComponent />
        </div>
    );
}
