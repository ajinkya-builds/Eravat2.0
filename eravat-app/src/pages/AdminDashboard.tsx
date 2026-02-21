import { motion } from 'framer-motion';
import { Users, Activity, AlertTriangle, ShieldCheck } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MOCK_DATA = [
  { name: '08:00', observations: 4 },
  { name: '10:00', observations: 7 },
  { name: '12:00', observations: 2 },
  { name: '14:00', observations: 9 },
  { name: '16:00', observations: 15 },
  { name: '18:00', observations: 12 },
  { name: '20:00', observations: 5 },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-6">

      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1 text-sm">Real-time pulse of patrol activity and sightings.</p>
        </div>
        <div className="flex gap-2">
          <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            System Online
          </div>
        </div>
      </motion.div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard delay={0.1} title="Sightings Today" value="24" trend="+12% from yesterday" icon={Activity} color="emerald" />
        <StatCard delay={0.2} title="Active Conflicts" value="3" trend="Requires attention" icon={AlertTriangle} color="destructive" />
        <StatCard delay={0.3} title="Guards on Patrol" value="112" trend="98% coverage" icon={ShieldCheck} color="primary" />
        <StatCard delay={0.4} title="Total Personnel" value="145" trend="Across all beats" icon={Users} color="muted" />
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 glass-card rounded-2xl p-6"
        >
          <h3 className="text-lg font-bold mb-6">Observation Frequency</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
          <h3 className="text-lg font-bold mb-4">Recent Alerts</h3>
          <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-muted/50 border border-border flex gap-3 items-start">
                <div className={`p-2 rounded-lg ${i % 2 === 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  {i % 2 === 0 ? <AlertTriangle size={16} /> : <Activity size={16} />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{i % 2 === 0 ? 'Conflict Reported' : 'Sighting Logged'}</p>
                  <p className="text-xs text-muted-foreground">Beat 0{i} • 10 mins ago</p>
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