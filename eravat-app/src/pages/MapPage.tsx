import { MapComponent } from '../components/shared/MapComponent';

export default function MapPage() {
    return (
        <div className="flex flex-col gap-6 p-4 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Territory Map</h1>
                    <p className="text-muted-foreground">View and filter territory observations and boundaries.</p>
                </div>
            </div>
            <MapComponent />
        </div>
    );
}
