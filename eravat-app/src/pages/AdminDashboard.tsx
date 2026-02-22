import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { motion } from 'framer-motion';
import { Users, Activity, AlertTriangle, ShieldCheck } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MapComponent, type ReportPoint } from '../components/shared/MapComponent';
import { format, subHours, isToday } from 'date-fns';
import { NotificationBell } from '../components/shared/NotificationBell';
import { useTranslation } from 'react-i18next';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  // Dashboard Metrics
  const [sightingsToday, setSightingsToday] = useState(0);
  const [activeConflicts, setActiveConflicts] = useState(0);
  const [totalPersonnel, setTotalPersonnel] = useState(0);
  const [guardsOnPatrol, setGuardsOnPatrol] = useState(0);

  // Chart Data
  const [hourlyData, setHourlyData] = useState<{ name: string, observations: number }[]>([]);

  // Maps & Feeds
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [mapPoints, setMapPoints] = useState<ReportPoint[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = new Date();

      // 1. Fetch Total Personnel
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      if (userCount) setTotalPersonnel(userCount);

      // (We don't have active patrol sessions yet, simulating using total personnel)
      setGuardsOnPatrol(Math.floor((userCount || 10) * 0.4));

      // 2. Fetch Recent Reports w/ Geolocation for Map & Feed
      const { data: reportsData } = await supabase
        .from('reports')
        .select(`
          id, 
          created_at,
          location,
          geo_beats (name),
          profiles (full_name),
          observations (type)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (reportsData) {
        // Calculate Sightings Today vs Conflicts
        let todayCount = 0;
        let conflictCount = 0;

        const feedItems: any[] = [];
        const mPoints: ReportPoint[] = [];

        // Build Hourly Data Buckets for the last 12 hours
        const hourlyBuckets = new Map<string, number>();
        for (let i = 11; i >= 0; i--) {
          hourlyBuckets.set(format(subHours(today, i), 'HH:00'), 0);
        }

        reportsData.forEach((rep: any) => {
          const repDate = new Date(rep.created_at);
          const rawObsType = rep.observations?.[0]?.type || 'direct';
          const obsType = rawObsType === 'direct_sighting' ? 'direct' :
            (rawObsType === 'indirect_sign' ? 'indirect' :
              (rawObsType === 'conflict_loss' ? 'loss' : rawObsType));

          // Metrics
          if (isToday(repDate)) {
            todayCount++;
            const hrStr = format(repDate, 'HH:00');
            if (hourlyBuckets.has(hrStr)) {
              hourlyBuckets.set(hrStr, hourlyBuckets.get(hrStr)! + 1);
            }
          }
          if (obsType === 'loss') {
            conflictCount++;
          }

          // Feed
          if (feedItems.length < 5) {
            feedItems.push({
              id: rep.id,
              type: obsType,
              beatName: rep.geo_beats?.name || 'Unknown Beat',
              userName: rep.profiles?.full_name || 'Officer',
              timeStr: format(repDate, 'HH:mm')
            });
          }

          // Map Points Parsing (Assuming PostGIS WKB string)
          if (rep.location) {
            try {
              // The frontend Supabase js client might return a string or an object depending on the PostGIS configuration.
              // We need to parse it. It's often returned as WKT or GeoJSON by PostGIS depending on your select query.
              // In our schema, it's a binary WKB. 
              // However, we can use a simpler query modifier if needed, or decode the hex if it comes back as hex.
              // We will skip raw WKB parsing if it's too complex and assume it comes as a hex string as before.

              // If the Supabase REST API returned a hex string for the geography:
              if (typeof rep.location === 'string') {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const Buffer = require('buffer').Buffer;
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const wkx = require('wkx');
                const b = Buffer.from(rep.location, 'hex');
                const geom = wkx.Geometry.parse(b);
                const geojson = geom.toGeoJSON();
                if (geojson.type === 'Point') {
                  mPoints.push({
                    id: rep.id,
                    lat: geojson.coordinates[1],
                    lng: geojson.coordinates[0],
                    type: obsType,
                    title: obsType === 'loss' ? 'Conflict' : 'Sighting',
                    subtitle: rep.geo_beats?.name || 'In Field'
                  });
                }
              }

            } catch (e) {
              console.error("Failed to parse geography point:", e);
            }
          }
        });

        setSightingsToday(todayCount);
        setActiveConflicts(conflictCount);
        setRecentReports(feedItems);
        setMapPoints(mPoints);

        const chartArr = Array.from(hourlyBuckets, ([name, observations]) => ({ name, observations }));
        setHourlyData(chartArr);
      }

    } catch (error) {
      console.error("Error fetching dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">

      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('admin.dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('admin.dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {t('admin.dashboard.systemOnline')} {loading && t('admin.dashboard.syncing')}
            </div>
          </div>
          <NotificationBell />
        </div>
      </motion.div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard delay={0.1} title={t('admin.dashboard.sightingsToday')} value={sightingsToday} trend={t('admin.dashboard.trendLive')} icon={Activity} color="emerald" />
        <StatCard delay={0.2} title={t('admin.dashboard.activeConflicts')} value={activeConflicts} trend={t('admin.dashboard.trendAttention')} icon={AlertTriangle} color="destructive" />
        <StatCard delay={0.3} title={t('admin.dashboard.guardsOnPatrol')} value={guardsOnPatrol} trend={t('admin.dashboard.trendEstimates')} icon={ShieldCheck} color="primary" />
        <StatCard delay={0.4} title={t('admin.dashboard.totalPersonnel')} value={totalPersonnel} trend={t('admin.dashboard.trendAcross')} icon={Users} color="muted" />
      </div>

      {/* Map Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-3">
          <MapComponent reportPoints={mapPoints} />
        </div>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 glass-card rounded-2xl p-6"
        >
          <h3 className="text-lg font-bold mb-6">{t('admin.dashboard.obsFrequency')}</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorObs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-card)', borderRadius: '12px', border: '1px solid var(--color-border)' }}
                  itemStyle={{ color: 'var(--color-primary)' }}
                />
                <Area type="monotone" dataKey="observations" stroke="var(--color-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorObs)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="glass-card rounded-2xl p-6 flex flex-col"
        >
          <h3 className="text-lg font-bold mb-4">{t('admin.dashboard.recentAlerts')}</h3>
          <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar min-h-[300px]">
            {recentReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                <ShieldCheck size={48} className="mb-2" />
                <p>{t('admin.dashboard.noAlerts')}</p>
              </div>
            ) : recentReports.map((alert) => (
              <div key={alert.id} className="p-3 rounded-xl bg-muted/50 border border-border flex gap-3 items-start">
                <div className={`p-2 rounded-lg ${alert.type === 'loss' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  {alert.type === 'loss' ? <AlertTriangle size={16} /> : <Activity size={16} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {alert.type === 'loss' ? t('admin.dashboard.conflictReported') : (alert.type === 'indirect' ? t('admin.dashboard.indirectSign') : t('admin.dashboard.directSighting'))}
                  </p>
                  <p className="text-xs text-muted-foreground">{alert.beatName} • {alert.userName}</p>
                </div>
                <div className="text-xs text-muted-foreground/70 font-medium whitespace-nowrap">
                  {alert.timeStr}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatCard({ title, value, trend, icon: Icon, color, delay }: any) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-500 bg-emerald-500/10",
    destructive: "text-destructive bg-destructive/10",
    primary: "text-primary bg-primary/10",
    muted: "text-muted-foreground bg-muted"
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay }}
      className="glass-card rounded-2xl p-5"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-foreground mb-1">{value}</p>
        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
        <p className="text-xs text-muted-foreground/70">{trend}</p>
      </div>
    </motion.div>
  );
}