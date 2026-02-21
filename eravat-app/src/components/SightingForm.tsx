import { useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraResultType } from '@capacitor/camera';
import { db } from '../db';

interface SightingFormProps {
  onClose: () => void;
}

export default function SightingForm({ onClose }: SightingFormProps) {
  // Stepper State
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  // Form Data State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [type, setType] = useState<'direct_sighting' | 'indirect_sign' | 'conflict_loss'>('direct_sighting');

  // Detail States
  const [maleCount, setMaleCount] = useState(0);
  const [femaleCount, setFemaleCount] = useState(0);
  const [calfCount, setCalfCount] = useState(0);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const takePhoto = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.Base64
      });
      if (image.base64String) {
        setPhotos(prev => [...prev, image.base64String!]);
      }
    } catch (e) {
      console.error('Camera error:', e);
    }
  };

  const handleNext = () => setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  const handleBack = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // 1. Get GPS
      const position = await Geolocation.getCurrentPosition();

      // 2. Generate IDs
      const reportId = crypto.randomUUID();
      const observationId = crypto.randomUUID();

      // 3. Save Envelope to Local DB
      await db.reports.add({
        id: reportId,
        user_id: 'offline-user-temp-id',
        device_timestamp: new Date().toISOString(),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        sync_status: 'pending',
        notes: notes
      });

      // 4. Save Details to Local DB
      await db.observations.add({
        id: observationId,
        report_id: reportId,
        type: type,
        male_count: type === 'direct_sighting' ? maleCount : 0,
        female_count: type === 'direct_sighting' ? femaleCount : 0,
        calf_count: type === 'direct_sighting' ? calfCount : 0,
        unknown_count: 0,
        indirect_sign_details: type === 'indirect_sign' ? notes : undefined
      });

      // 5. Save Photos
      for (const base64Data of photos) {
        await db.report_media.add({
          id: crypto.randomUUID(),
          report_id: reportId,
          file_data: base64Data,
          mime_type: 'image/jpeg'
        });
      }

      alert('Sighting saved locally! Will sync when online.');
      onClose();
    } catch (error) {
      console.error('Error saving sighting:', error);
      alert('Could not get GPS location. Please ensure location services are enabled.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/60 z-[2000] flex justify-center items-end pb-4 px-4 backdrop-blur-sm">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl animate-accordion-up flex flex-col max-h-[90vh]">

        {/* Header & Close Button */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Log Activity</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none">&times;</button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex justify-between mb-2">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-2 flex-1 mx-1 rounded-full ${step <= currentStep ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center font-medium uppercase tracking-wider">
            Step {currentStep} of {totalSteps}
          </p>
        </div>

        {/* Form Content Area (Scrollable if needed) */}
        <div className="p-6 overflow-y-auto flex-1">

          {/* STEP 1: Type Selection */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">What did you observe?</h3>

              <button
                onClick={() => setType('direct_sighting')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${type === 'direct_sighting' ? 'border-primary bg-blue-50' : 'border-border bg-card'}`}
              >
                <div className="font-bold text-foreground">🐘 Direct Sighting</div>
                <div className="text-sm text-muted-foreground">Physically spotted an elephant or herd.</div>
              </button>

              <button
                onClick={() => setType('indirect_sign')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${type === 'indirect_sign' ? 'border-secondary bg-green-50' : 'border-border bg-card'}`}
              >
                <div className="font-bold text-foreground">👣 Indirect Sign</div>
                <div className="text-sm text-muted-foreground">Dung, footprints, or feeding signs.</div>
              </button>

              <button
                onClick={() => setType('conflict_loss')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${type === 'conflict_loss' ? 'border-destructive bg-red-50' : 'border-border bg-card'}`}
              >
                <div className="font-bold text-foreground">⚠️ Conflict / Loss</div>
                <div className="text-sm text-muted-foreground">Crop damage, property damage, or injury.</div>
              </button>
            </div>
          )}

          {/* STEP 2: Details based on Type */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">Provide Details</h3>

              {type === 'direct_sighting' && (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-muted p-3 rounded-xl">
                    <label className="text-sm font-semibold block mb-2 text-muted-foreground">Male</label>
                    <input type="number" min="0" value={maleCount} onChange={(e) => setMaleCount(Number(e.target.value))} className="w-full text-center text-xl font-bold bg-transparent border-b-2 border-primary focus:outline-none" />
                  </div>
                  <div className="bg-muted p-3 rounded-xl">
                    <label className="text-sm font-semibold block mb-2 text-muted-foreground">Female</label>
                    <input type="number" min="0" value={femaleCount} onChange={(e) => setFemaleCount(Number(e.target.value))} className="w-full text-center text-xl font-bold bg-transparent border-b-2 border-primary focus:outline-none" />
                  </div>
                  <div className="bg-muted p-3 rounded-xl">
                    <label className="text-sm font-semibold block mb-2 text-muted-foreground">Calves</label>
                    <input type="number" min="0" value={calfCount} onChange={(e) => setCalfCount(Number(e.target.value))} className="w-full text-center text-xl font-bold bg-transparent border-b-2 border-primary focus:outline-none" />
                  </div>
                </div>
              )}

              {(type === 'indirect_sign' || type === 'conflict_loss') && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-muted-foreground">Description</label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Describe what you found..."
                    className="w-full p-3 rounded-xl bg-muted border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                  />
                </div>
              )}

              {/* Photo Capture Section */}
              <div className="space-y-2 mt-4 pt-4 border-t border-border">
                <label className="text-sm font-semibold text-muted-foreground">Photos</label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map((photo, i) => (
                    <img key={i} src={`data:image/jpeg;base64,${photo}`} alt="Captured" className="h-20 w-20 object-cover rounded-lg border border-border" />
                  ))}
                  <button
                    onClick={takePhoto}
                    className="h-20 w-20 flex-shrink-0 flex items-center justify-center bg-muted border-2 border-dashed border-border rounded-lg text-muted-foreground hover:bg-gray-100 transition-colors"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Review & Submit */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">Location & Save</h3>
              <div className="bg-muted p-4 rounded-xl text-center space-y-2">
                <span className="text-4xl block">📍</span>
                <p className="text-sm text-foreground font-medium">Your exact GPS coordinates will be captured automatically when you save.</p>
                <p className="text-xs text-muted-foreground">Make sure you are standing near the observation site.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="p-6 border-t border-border flex gap-3 bg-gray-50 rounded-b-2xl">
          {currentStep > 1 && (
            <button
              onClick={handleBack}
              className="flex-1 py-3 font-bold rounded-xl bg-white border border-border text-foreground hover:bg-gray-100"
            >
              Back
            </button>
          )}

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              className="flex-1 py-3 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-blue-600"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 py-3 font-bold rounded-xl bg-secondary text-secondary-foreground hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Report'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}