import { useState } from 'react';
import { MapContainer, WMSTileLayer } from 'react-leaflet';
import SightingForm from '../components/SightingForm';
import { syncData } from '../services/syncService';

export default function MobilePatrol() {
  // This state controls whether the popup form is visible or not
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    const result = await syncData();
    if (result.success) {
      alert(`Sync successful! ${result.count} reports uploaded.`);
    } else {
      alert('Sync failed. Please check your connection.');
    }
    setIsSyncing(false);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden relative">
      {/* Top App Bar - Now using Secondary (Green) */}
      <header className="bg-secondary text-secondary-foreground p-4 shadow-md z-10 flex justify-between items-center">
        <h1 className="text-xl font-bold">Field Patrol</h1>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="bg-white/20 px-3 py-1 rounded-sm text-sm font-medium hover:bg-white/30 transition-colors disabled:opacity-50"
        >
          {isSyncing ? 'Syncing...' : 'Sync (Offline)'}
        </button>
      </header>

      {/* Map Container */}
      <main className="flex-grow relative z-0">
        <MapContainer
          center={[22.9868, 77.2653]}
          zoom={6}
          className="h-full w-full"
          zoomControl={false}
        >
          <WMSTileLayer
            url="https://bhuvan-vec1.nrsc.gov.in/bhuvan/gwc/service/wms/"
            layers="india3"
            format="image/png"
            transparent={true}
            attribution="Data © ISRO Bhuvan"
          />
        </MapContainer>
      </main>

      {/* Floating Action Button - Connected to setIsFormOpen */}
      <div className="absolute bottom-6 w-full flex justify-center z-[1000]">
        <button
          onClick={() => setIsFormOpen(true)}
          className="bg-primary text-primary-foreground px-8 py-4 rounded-xl font-bold shadow-lg shadow-black/30 border-2 border-white text-lg active:scale-95 transition-transform"
        >
          + Log Sighting
        </button>
      </div>

      {/* Conditionally render the form popup when isFormOpen is true */}
      {isFormOpen && <SightingForm onClose={() => setIsFormOpen(false)} />}
    </div>
  );
}