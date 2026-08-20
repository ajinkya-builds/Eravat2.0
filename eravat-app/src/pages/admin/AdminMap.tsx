import { MapComponent } from '../../components/shared/MapComponent';
import { useLanguage } from '../../contexts/LanguageContext';

export default function AdminMap() {
    const { t } = useLanguage();
    return (
        <div className="flex flex-col gap-6 p-4 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('admin.map.title')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('admin.map.subtitle')}</p>
                </div>
            </div>
            <MapComponent showObservationPins={true} />
        </div>
    );
}
