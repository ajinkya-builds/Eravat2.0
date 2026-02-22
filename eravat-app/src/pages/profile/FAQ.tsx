import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FAQ() {
    const navigate = useNavigate();

    const faqs = [
        { q: "How do I report a wild elephant sighting?", a: "Go to the Dashboard and tap 'Report Activity'. Fill in the location, number of elephants, and add an optional photo." },
        { q: "Do I need internet to submit a report?", a: "No! The app works offline. Reports are saved locally and will automatically sync once you regain internet connection." },
        { q: "What should I do in case of a direct encounter?", a: "Maintain a safe distance, do not panic, and slowly back away. Never try to feed or flash the camera at wild elephants." },
        { q: "How is my location data used?", a: "Your location is only captured when submitting a report to accurately map animal movements and conflict zones." }
    ];

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            <div className="sticky top-0 z-40 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">Frequently Asked Questions</h1>
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
