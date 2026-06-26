import { MapComponent } from '../../components/shared/MapComponent';

export default function AdminMap() {
    return (
        <div className="flex flex-col gap-6 p-4 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Territory Operations Map</h1>
                    <p className="text-muted-foreground text-sm mt-1">Command Center Live Tracking and Historical Hotspots.</p>
                </div>
            </div>
            <MapComponent showObservationPins={true} />
        </div>
    );
}
