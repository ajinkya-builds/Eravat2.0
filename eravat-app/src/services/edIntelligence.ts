/**
 * ED-style conservation intelligence over Eravat reports.
 * Rules and weights match ed/core/{config,analytics,intelligence,hotspots}.py
 */

export const SEVERITY_WEIGHTS = {
  presence: 0.5,
  grain: 1.5,
  crop: 2.5,
  house: 5.0,
  injury: 25.0,
} as const;
export const DEATH_WEIGHT_PER_PERSON = 100;

export const NIGHT_HOUR_START = 18;
export const NIGHT_HOUR_END = 6;
export const DEFAULT_RECENT_DAYS = 90;
export const MIN_WINDOW_DAYS = 14;
export const MIN_EVENTS_FOR_TREND = 5;
export const ESCALATION_RATIO = 1.5;
export const CRITICAL_CASUALTY_WINDOW_DAYS = 90;
export const CONFIDENCE_THRESHOLDS = { High: 30, Medium: 10 };
export const RATE_MULTIPLE_FOR_HIGH = 1.5;
export const INJURIES_FOR_CRITICAL = 3;
export const HOUSE_EVENTS_FOR_HIGH = 5;
export const EVENTS_FOR_ESCALATION_HIGH = 10;
export const SCORE_WEIGHTS = {
  casualty: 0.35,
  burden: 0.2,
  intensity: 0.2,
  exposure: 0.1,
  trend: 0.05,
  composition: 0.1,
};
export const CASUALTY_POINTS_PER_DEATH = 60;
export const CASUALTY_POINTS_PER_INJURY = 25;
export const HISTORICAL_CASUALTY_DISCOUNT = 0.5;
export const FALLBACK_PRIOR_STRENGTH = 10;
export const PRIOR_STRENGTH_BOUNDS: [number, number] = [1, 200];
export const NIGHT_SHARE_FOR_PATROL_SHIFT = 60;
export const VILLAGE_SHARE_FOR_EARLY_WARNING = 50;
export const SOLITARY_MAX_GROUP = 3;
export const BULL_SHARE_FOR_ALERT = 60;
export const MIN_CONFLICTS_FOR_COMPOSITION = 3;
export const EWS_MATCH_RADIUS_KM = 2;
export const MIN_EWS_CONTACTS = 3;
export const DEFAULT_EPS_KM = 1;
export const DEFAULT_MIN_SAMPLES = 15;
export const CONFLICT_SHARE_FOR_HIGH = 0.25;
export const EVENTS_FOR_WATCH = 5;
export const KM_PER_DEG_LAT = 110.57;
export const KM_PER_DEG_LON_EQUATOR = 111.32;
export const NEAR_VILLAGE_THRESHOLD_KM = 2;
export const DEFAULT_VILLAGE_RADIUS_KM = 3;
export const DEFAULT_COVERAGE_TARGET = 0.6;
export const EARTH_RADIUS_KM = 6371;

export const TIER_CRITICAL = 'Critical';
export const TIER_HIGH = 'High';
export const TIER_WATCH = 'Watch';
export const TIER_ROUTINE = 'Routine';
export const TIER_ORDER = [TIER_CRITICAL, TIER_HIGH, TIER_WATCH, TIER_ROUTINE] as const;
export type PriorityTier = (typeof TIER_ORDER)[number];

export const TREND_ESCALATING = 'Escalating';
export const TREND_STABLE = 'Stable';
export const TREND_EASING = 'Easing';
export const TREND_UNKNOWN = 'Insufficient data';

export type GroupType = 'Unrecorded' | 'Family herd' | 'Lone bull' | 'Bull party' | 'Mixed / unsexed';
export type ConflictCategory = 'Death' | 'Injury' | 'House' | 'Crop' | 'Presence';

export interface VillageCentroid {
  name: string;
  latitude: number;
  longitude: number;
}

export interface SightingFact {
  id: string;
  at: Date;
  beat: string;
  range: string;
  division: string;
  lat: number | null;
  lng: number | null;
  male: number;
  female: number;
  calf: number;
  unknown: number;
  totalElephants: number;
  crop: boolean;
  grain: boolean;
  house: boolean;
  deaths: number;
  injuries: number;
}

export interface BeatRow {
  beat: string;
  division: string;
  range: string;
  tier: PriorityTier;
  score: number;
  confidence: 'High' | 'Medium' | 'Low';
  reports: number;
  conflictEvents: number;
  conflictRatePct: number;
  adjConflictRatePct: number;
  humanDeaths: number;
  peopleInjured: number;
  recentDeaths: number;
  recentInjuries: number;
  houseEvents: number;
  cropEvents: number;
  damageBurden: number;
  nightConflictPct: number | null;
  nearVillagePct: number | null;
  bullConflictPct: number | null;
  trend: string;
  recentVsPrior: string;
  action: string;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isNightHour(hour: number | null): boolean | null {
  if (hour == null || !Number.isFinite(hour)) return null;
  return hour >= NIGHT_HOUR_START || hour < NIGHT_HOUR_END;
}

export function classifyGroup(fact: SightingFact): GroupType {
  const recorded = fact.male + fact.female + fact.calf + fact.unknown > 0;
  if (!recorded) return 'Unrecorded';
  if (fact.calf > 0 || fact.female > 0) return 'Family herd';
  const total = fact.totalElephants || fact.male + fact.female + fact.calf + fact.unknown;
  if (fact.male > 0 && total <= 1) return 'Lone bull';
  if (fact.male > 0 && total <= SOLITARY_MAX_GROUP) return 'Bull party';
  return 'Mixed / unsexed';
}

export function isBullType(fact: SightingFact): boolean {
  const g = classifyGroup(fact);
  return g === 'Lone bull' || g === 'Bull party';
}

export function isConflict(fact: SightingFact): boolean {
  return fact.crop || fact.grain || fact.house || fact.deaths > 0 || fact.injuries > 0;
}

export function classifyConflict(fact: SightingFact): ConflictCategory {
  if (fact.deaths > 0) return 'Death';
  if (fact.injuries > 0) return 'Injury';
  if (fact.house) return 'House';
  if (fact.crop || fact.grain) return 'Crop';
  return 'Presence';
}

export function severityScore(fact: SightingFact): number {
  return (
    (fact.totalElephants > 0 ? SEVERITY_WEIGHTS.presence : 0) +
    (fact.crop ? SEVERITY_WEIGHTS.crop : 0) +
    (fact.grain ? SEVERITY_WEIGHTS.grain : 0) +
    (fact.house ? SEVERITY_WEIGHTS.house : 0) +
    fact.injuries * SEVERITY_WEIGHTS.injury +
    fact.deaths * DEATH_WEIGHT_PER_PERSON
  );
}

export function propertySeverity(fact: SightingFact): number {
  return (
    (fact.totalElephants > 0 ? SEVERITY_WEIGHTS.presence : 0) +
    (fact.crop ? SEVERITY_WEIGHTS.crop : 0) +
    (fact.grain ? SEVERITY_WEIGHTS.grain : 0) +
    (fact.house ? SEVERITY_WEIGHTS.house : 0)
  );
}

export function shrinkRates(
  successes: number[],
  trials: number[],
  priorStrength?: number,
): { adjusted: number[]; priorMean: number; priorStrength: number } {
  const totalTrials = trials.reduce((a, b) => a + b, 0);
  const totalSucc = successes.reduce((a, b) => a + b, 0);
  if (totalTrials <= 0 || trials.length === 0) {
    return {
      adjusted: successes.map(() => 0),
      priorMean: 0,
      priorStrength: priorStrength ?? FALLBACK_PRIOR_STRENGTH,
    };
  }
  const priorMean = totalSucc / totalTrials;
  const k = priorStrength ?? fitPriorStrength(successes, trials, priorMean);
  return {
    adjusted: successes.map((x, i) => (x + k * priorMean) / (trials[i] + k)),
    priorMean,
    priorStrength: k,
  };
}

function fitPriorStrength(x: number[], n: number[], priorMean: number): number {
  const usable = n.map((ni, i) => ({ ni, xi: x[i] })).filter((r) => r.ni > 0);
  if (usable.length < 2 || priorMean <= 0 || priorMean >= 1) return FALLBACK_PRIOR_STRENGTH;
  const nSum = usable.reduce((a, r) => a + r.ni, 0);
  const rates = usable.map((r) => r.xi / r.ni);
  const observedVar = usable.reduce((a, r, i) => a + (r.ni / nSum) * (rates[i] - priorMean) ** 2, 0);
  const binomialVar = (priorMean * (1 - priorMean) * (usable.length - 1)) / nSum;
  const excess = observedVar - binomialVar;
  if (excess <= 0) return PRIOR_STRENGTH_BOUNDS[1];
  const k = (priorMean * (1 - priorMean)) / excess - 1;
  if (!Number.isFinite(k)) return FALLBACK_PRIOR_STRENGTH;
  return Math.min(PRIOR_STRENGTH_BOUNDS[1], Math.max(PRIOR_STRENGTH_BOUNDS[0], k));
}

function percentileRank(values: number[]): number[] {
  const uniq = new Set(values);
  if (uniq.size <= 1) return values.map(() => 0);
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const less = sorted.filter((s) => s < v).length;
    const equal = sorted.filter((s) => s === v).length;
    return ((less + 0.5 * equal) / values.length) * 100;
  });
}

function beatKey(f: SightingFact): string {
  return `${f.division}\0${f.range}\0${f.beat}`;
}

export function nearestVillageKm(
  lat: number,
  lng: number,
  centroids: VillageCentroid[],
): { name: string; km: number } | null {
  if (!centroids.length) return null;
  let best: { name: string; km: number } | null = null;
  for (const c of centroids) {
    const km = haversineKm(lat, lng, c.latitude, c.longitude);
    if (!best || km < best.km) best = { name: c.name, km };
  }
  return best;
}

export function beatIntelligence(
  facts: SightingFact[],
  centroids: VillageCentroid[],
  asOf?: Date,
  recentDays = DEFAULT_RECENT_DAYS,
  criticalWindowDays = CRITICAL_CASUALTY_WINDOW_DAYS,
): BeatRow[] {
  if (!facts.length) return [];
  const groups = new Map<string, SightingFact[]>();
  for (const f of facts) {
    const k = beatKey(f);
    const list = groups.get(k) ?? [];
    list.push(f);
    groups.set(k, list);
  }

  const anchor = asOf ?? new Date(Math.max(...facts.map((f) => f.at.getTime())));
  const criticalCutoff = new Date(anchor.getTime() - criticalWindowDays * 86400000);

  const dates = facts.map((f) => f.at.getTime());
  const end = new Date(Math.max(...dates));
  const start = new Date(Math.min(...dates));
  const spanDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const window = Math.min(recentDays, Math.floor(spanDays / 2));
  const trendOk = window >= MIN_WINDOW_DAYS;
  const recentStart = new Date(end.getTime() - window * 86400000);
  const priorStart = new Date(recentStart.getTime() - window * 86400000);

  type Agg = {
    beat: string;
    division: string;
    range: string;
    reports: number;
    conflict: number;
    deaths: number;
    injuries: number;
    recentDeaths: number;
    recentInjuries: number;
    house: number;
    crop: number;
    burden: number;
    nightN: number;
    nightD: number;
    villageN: number;
    villageD: number;
    bullN: number;
    bullD: number;
    recentC: number;
    priorC: number;
  };

  const aggs: Agg[] = [];
  for (const list of groups.values()) {
    const sample = list[0];
    const a: Agg = {
      beat: sample.beat,
      division: sample.division,
      range: sample.range,
      reports: list.length,
      conflict: 0,
      deaths: 0,
      injuries: 0,
      recentDeaths: 0,
      recentInjuries: 0,
      house: 0,
      crop: 0,
      burden: 0,
      nightN: 0,
      nightD: 0,
      villageN: 0,
      villageD: 0,
      bullN: 0,
      bullD: 0,
      recentC: 0,
      priorC: 0,
    };
    for (const f of list) {
      const conflict = isConflict(f);
      if (conflict) a.conflict++;
      a.deaths += f.deaths;
      a.injuries += f.injuries;
      if (f.at > criticalCutoff) {
        a.recentDeaths += f.deaths;
        a.recentInjuries += f.injuries;
      }
      const cat = classifyConflict(f);
      if (cat === 'House') a.house++;
      if (cat === 'Crop') a.crop++;
      a.burden += propertySeverity(f);
      a.villageD++;
      if (f.lat != null && f.lng != null) {
        const nv = nearestVillageKm(f.lat, f.lng, centroids);
        if (nv && nv.km <= NEAR_VILLAGE_THRESHOLD_KM) a.villageN++;
      }
      if (conflict) {
        const hour = f.at.getHours();
        const night = isNightHour(hour);
        if (night != null) {
          a.nightD++;
          if (night) a.nightN++;
        }
        a.bullD++;
        if (isBullType(f)) a.bullN++;
      }
      if (trendOk) {
        if (f.at > recentStart && f.at <= end && conflict) a.recentC++;
        if (f.at > priorStart && f.at <= recentStart && conflict) a.priorC++;
      }
    }
    aggs.push(a);
  }

  const shrunk = shrinkRates(
    aggs.map((a) => a.conflict),
    aggs.map((a) => a.reports),
  );
  const landscapeRate = shrunk.priorMean * 100;
  const burdens = aggs.map((a) => a.burden);
  const burdenRanks = percentileRank(burdens);

  const rows: BeatRow[] = aggs.map((a, i) => {
    const conflictRatePct = a.reports ? (a.conflict / a.reports) * 100 : 0;
    const adj = shrunk.adjusted[i] * 100;
    let trend = TREND_UNKNOWN;
    let recentVsPrior = 'n/a';
    if (trendOk) {
      recentVsPrior = `${a.recentC} vs ${a.priorC}`;
      const total = a.recentC + a.priorC;
      const ratio = (a.recentC + 0.5) / (a.priorC + 0.5);
      if (total < MIN_EVENTS_FOR_TREND) trend = TREND_UNKNOWN;
      else if (ratio >= ESCALATION_RATIO) trend = TREND_ESCALATING;
      else if (ratio <= 1 / ESCALATION_RATIO) trend = TREND_EASING;
      else trend = TREND_STABLE;
    }
    const confidence: BeatRow['confidence'] =
      a.reports >= CONFIDENCE_THRESHOLDS.High
        ? 'High'
        : a.reports >= CONFIDENCE_THRESHOLDS.Medium
          ? 'Medium'
          : 'Low';
    const bullPct = a.bullD ? (a.bullN / a.bullD) * 100 : null;
    const nightPct = a.nightD ? (a.nightN / a.nightD) * 100 : null;
    const villagePct = a.villageD ? (a.villageN / a.villageD) * 100 : null;

    const olderDeaths = Math.max(0, a.deaths - a.recentDeaths);
    const olderInj = Math.max(0, a.injuries - a.recentInjuries);
    const casualty = Math.min(
      100,
      a.recentDeaths * CASUALTY_POINTS_PER_DEATH +
        a.recentInjuries * CASUALTY_POINTS_PER_INJURY +
        olderDeaths * CASUALTY_POINTS_PER_DEATH * HISTORICAL_CASUALTY_DISCOUNT +
        olderInj * CASUALTY_POINTS_PER_INJURY * HISTORICAL_CASUALTY_DISCOUNT,
    );
    const composition =
      a.conflict >= MIN_CONFLICTS_FOR_COMPOSITION ? (bullPct ?? 50) : 50;
    const trendScore =
      trend === TREND_ESCALATING ? 100 : trend === TREND_EASING ? 0 : 50;
    const exposure = villagePct != null ? ((nightPct ?? 0) + villagePct) / 2 : (nightPct ?? 0);
    const score =
      casualty * SCORE_WEIGHTS.casualty +
      burdenRanks[i] * SCORE_WEIGHTS.burden +
      Math.min(100, Math.max(0, adj)) * SCORE_WEIGHTS.intensity +
      exposure * SCORE_WEIGHTS.exposure +
      trendScore * SCORE_WEIGHTS.trend +
      composition * SCORE_WEIGHTS.composition;

    const rateThreshold = landscapeRate * RATE_MULTIPLE_FOR_HIGH;
    const rateElevated = adj >= rateThreshold && adj > 0 && landscapeRate > 0;
    const confident = confidence !== 'Low';
    let tier: PriorityTier = TIER_ROUTINE;
    if (
      a.recentDeaths > 0 ||
      (a.recentInjuries > 0 && trend === TREND_ESCALATING) ||
      a.recentInjuries >= INJURIES_FOR_CRITICAL
    ) {
      tier = TIER_CRITICAL;
    } else if (
      a.deaths > 0 ||
      a.injuries > 0 ||
      (rateElevated && confident) ||
      a.house >= HOUSE_EVENTS_FOR_HIGH ||
      (trend === TREND_ESCALATING && a.conflict >= EVENTS_FOR_ESCALATION_HIGH)
    ) {
      tier = TIER_HIGH;
    } else if (trend === TREND_ESCALATING || rateElevated) {
      tier = TIER_WATCH;
    }

    const actions: string[] = [];
    const room = () => actions.length < 3;
    if (a.recentDeaths > 0) {
      actions.push('Post rapid-response team; process ex-gratia; issue community alert');
    } else if (a.recentInjuries > 0) {
      actions.push('Rapid-response team on call; check early-warning coverage');
    } else if (a.deaths > 0) {
      actions.push('Past fatality, none recent: verify the mitigation put in place is holding');
    } else if (a.injuries > 0) {
      actions.push('Past injury, none recent: confirm early-warning coverage');
    }
    if (bullPct != null && a.conflict >= MIN_CONFLICTS_FOR_COMPOSITION && room()) {
      if (bullPct >= BULL_SHARE_FOR_ALERT) {
        actions.push(
          `Bull-driven (${Math.round(bullPct)}% of conflict): identify the animal, target night watch on its approach routes`,
        );
      } else if (bullPct <= 100 - BULL_SHARE_FOR_ALERT) {
        actions.push('Herd movement: keep passage open and control crowds; do not drive the herd');
      }
    }
    if (nightPct != null && nightPct >= NIGHT_SHARE_FOR_PATROL_SHIFT && room()) {
      actions.push(`Shift patrol to the night window (${Math.round(nightPct)}% of conflict)`);
    }
    if (villagePct != null && villagePct >= VILLAGE_SHARE_FOR_EARLY_WARNING && room()) {
      actions.push('Village early warning; assess barriers on approach routes');
    }
    if (a.house > 0 && a.house >= a.crop && room()) {
      actions.push('Secure grain stores; structural mitigation for homesteads');
    } else if (a.crop > 0 && room()) {
      actions.push('Crop-guarding support; review fencing on repeat-hit plots');
    }
    if (trend === TREND_ESCALATING && room()) {
      actions.push('Escalating: re-survey beat and establish the cause');
    }
    if (confidence === 'Low' && tier !== TIER_ROUTINE && room()) {
      actions.push('Thin reporting: confirm with beat guard before committing staff');
    }
    if (!actions.length) actions.push('Routine monitoring');

    return {
      beat: a.beat,
      division: a.division,
      range: a.range,
      tier,
      score: Math.round(score * 10) / 10,
      confidence,
      reports: a.reports,
      conflictEvents: a.conflict,
      conflictRatePct: Math.round(conflictRatePct * 10) / 10,
      adjConflictRatePct: Math.round(adj * 10) / 10,
      humanDeaths: a.deaths,
      peopleInjured: a.injuries,
      recentDeaths: a.recentDeaths,
      recentInjuries: a.recentInjuries,
      houseEvents: a.house,
      cropEvents: a.crop,
      damageBurden: Math.round(a.burden * 10) / 10,
      nightConflictPct: nightPct != null ? Math.round(nightPct * 10) / 10 : null,
      nearVillagePct: villagePct != null ? Math.round(villagePct * 10) / 10 : null,
      bullConflictPct: bullPct != null ? Math.round(bullPct * 10) / 10 : null,
      trend,
      recentVsPrior,
      action: actions.slice(0, 3).join('; '),
    };
  });

  return rows.sort((x, y) => {
    const tr = TIER_ORDER.indexOf(x.tier) - TIER_ORDER.indexOf(y.tier);
    if (tr !== 0) return tr;
    if (y.score !== x.score) return y.score - x.score;
    return y.humanDeaths - x.humanDeaths;
  });
}

export interface HotspotRow {
  id: number;
  events: number;
  conflictShare: number;
  deaths: number;
  injuries: number;
  lat: number;
  lng: number;
  radiusKm: number;
  tier: PriorityTier;
}

function dbscan(points: [number, number][], eps: number, minSamples: number): number[] {
  const n = points.length;
  const labels = Array(n).fill(-1);
  if (!n) return labels;
  const neighbours: number[][] = points.map((_, i) => {
    const list: number[] = [];
    for (let j = 0; j < n; j++) {
      const dx = points[i][0] - points[j][0];
      const dy = points[i][1] - points[j][1];
      if (Math.hypot(dx, dy) <= eps) list.push(j);
    }
    return list;
  });
  const visited = Array(n).fill(false);
  let clusterId = 0;
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    if (neighbours[i].length < minSamples) continue;
    labels[i] = clusterId;
    const queue = [...neighbours[i]];
    while (queue.length) {
      const j = queue.pop()!;
      if (!visited[j]) {
        visited[j] = true;
        if (neighbours[j].length >= minSamples) queue.push(...neighbours[j]);
      }
      if (labels[j] === -1) labels[j] = clusterId;
    }
    clusterId++;
  }
  return labels;
}

export function detectHotspots(facts: SightingFact[], asOf?: Date): HotspotRow[] {
  const pts = facts.filter((f) => f.lat != null && f.lng != null) as Array<
    SightingFact & { lat: number; lng: number }
  >;
  if (pts.length < DEFAULT_MIN_SAMPLES) return [];
  const refLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const plane: [number, number][] = pts.map((p) => [
    p.lng * KM_PER_DEG_LON_EQUATOR * Math.cos((refLat * Math.PI) / 180),
    p.lat * KM_PER_DEG_LAT,
  ]);
  const labels = dbscan(plane, DEFAULT_EPS_KM, DEFAULT_MIN_SAMPLES);
  const clusters = new Map<number, typeof pts>();
  pts.forEach((p, i) => {
    const lab = labels[i];
    if (lab < 0) return;
    const list = clusters.get(lab) ?? [];
    list.push(p);
    clusters.set(lab, list);
  });
  const totalConflict = facts.filter(isConflict).length || 1;
  const anchor = asOf ?? new Date();
  const cutoff = new Date(anchor.getTime() - CRITICAL_CASUALTY_WINDOW_DAYS * 86400000);
  const rows: HotspotRow[] = [];
  for (const [id, members] of clusters) {
    const conflict = members.filter(isConflict).length;
    const deaths = members.reduce((s, m) => s + m.deaths, 0);
    const injuries = members.reduce((s, m) => s + m.injuries, 0);
    const recentDeaths = members.filter((m) => m.at > cutoff).reduce((s, m) => s + m.deaths, 0);
    const lat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const lng = members.reduce((s, m) => s + m.lng, 0) / members.length;
    let maxR = 0;
    for (const m of members) maxR = Math.max(maxR, haversineKm(lat, lng, m.lat, m.lng));
    const share = conflict / totalConflict;
    let tier: PriorityTier = TIER_ROUTINE;
    if (recentDeaths > 0) tier = TIER_CRITICAL;
    else if (share >= CONFLICT_SHARE_FOR_HIGH || deaths > 0 || injuries > 0) tier = TIER_HIGH;
    else if (members.length >= EVENTS_FOR_WATCH) tier = TIER_WATCH;
    rows.push({
      id,
      events: members.length,
      conflictShare: Math.round(share * 1000) / 10,
      deaths,
      injuries,
      lat,
      lng,
      radiusKm: Math.round(maxR * 10) / 10,
      tier,
    });
  }
  return rows.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.events - a.events);
}

export interface VillageRiskRow {
  name: string;
  events: number;
  deaths: number;
  injuries: number;
  kmMedian: number;
}

export function villageRisk(facts: SightingFact[], centroids: VillageCentroid[]): VillageRiskRow[] {
  const map = new Map<string, { events: number; deaths: number; injuries: number; kms: number[] }>();
  for (const f of facts) {
    if (!isConflict(f) || f.lat == null || f.lng == null) continue;
    const nv = nearestVillageKm(f.lat, f.lng, centroids);
    if (!nv || nv.km > DEFAULT_VILLAGE_RADIUS_KM) continue;
    const cur = map.get(nv.name) ?? { events: 0, deaths: 0, injuries: 0, kms: [] };
    cur.events++;
    cur.deaths += f.deaths;
    cur.injuries += f.injuries;
    cur.kms.push(nv.km);
    map.set(nv.name, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => {
      const sorted = [...v.kms].sort((a, b) => a - b);
      const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
      return { name, events: v.events, deaths: v.deaths, injuries: v.injuries, kmMedian: Math.round(mid * 10) / 10 };
    })
    .sort((a, b) => b.deaths - a.deaths || b.injuries - a.injuries || b.events - a.events)
    .slice(0, 12);
}

export interface CoverageRow {
  village: string;
  contacts: number;
  status: 'No contact' | 'Thin' | 'Covered';
  events: number;
}

export function ewsCoverage(
  villagers: { lat: number; lng: number }[],
  risk: VillageRiskRow[],
  centroids: VillageCentroid[],
): CoverageRow[] {
  const counts = new Map<string, number>();
  for (const v of villagers) {
    const nv = nearestVillageKm(v.lat, v.lng, centroids);
    if (!nv || nv.km > EWS_MATCH_RADIUS_KM) continue;
    counts.set(nv.name, (counts.get(nv.name) ?? 0) + 1);
  }
  return risk.map((r) => {
    const contacts = counts.get(r.name) ?? 0;
    const status: CoverageRow['status'] =
      contacts <= 0 ? 'No contact' : contacts < MIN_EWS_CONTACTS ? 'Thin' : 'Covered';
    return { village: r.name, contacts, status, events: r.events };
  });
}

export function compositionSummary(facts: SightingFact[]) {
  const order: GroupType[] = ['Lone bull', 'Bull party', 'Family herd', 'Mixed / unsexed', 'Unrecorded'];
  const map = new Map<GroupType, { sightings: number; conflict: number; deaths: number }>();
  for (const g of order) map.set(g, { sightings: 0, conflict: 0, deaths: 0 });
  for (const f of facts) {
    const g = classifyGroup(f);
    const row = map.get(g)!;
    row.sightings++;
    if (isConflict(f)) row.conflict++;
    row.deaths += f.deaths;
  }
  return order
    .map((group) => {
      const r = map.get(group)!;
      return {
        group,
        sightings: r.sightings,
        conflict: r.conflict,
        damageRatePct: r.sightings ? Math.round((r.conflict / r.sightings) * 1000) / 10 : 0,
        deaths: r.deaths,
      };
    })
    .filter((r) => r.sightings > 0);
}

export function hourlyConflictProfile(facts: SightingFact[]): {
  hourly: number[];
  peak: { start: number; end: number; share: number; events: number } | null;
} {
  const hourly = Array(24).fill(0);
  for (const f of facts) {
    if (isConflict(f)) hourly[f.at.getHours()]++;
  }
  const total = hourly.reduce((a, b) => a + b, 0);
  if (!total) return { hourly, peak: null };
  let best: { start: number; end: number; share: number; events: number; hours: number } | null = null;
  for (let start = 0; start < 24; start++) {
    let acc = 0;
    for (let len = 1; len <= 24; len++) {
      acc += hourly[(start + len - 1) % 24];
      const share = acc / total;
      if (share >= DEFAULT_COVERAGE_TARGET) {
        if (!best || len < best.hours || (len === best.hours && acc > best.events)) {
          best = {
            start,
            end: (start + len) % 24,
            share: Math.round(share * 1000) / 10,
            events: acc,
            hours: len,
          };
        }
        break;
      }
    }
  }
  return { hourly, peak: best ? { start: best.start, end: best.end, share: best.share, events: best.events } : null };
}

export function headlines(beats: BeatRow[], facts: SightingFact[]): string[] {
  const critical = beats.filter((b) => b.tier === TIER_CRITICAL).length;
  const high = beats.filter((b) => b.tier === TIER_HIGH).length;
  const deaths = facts.reduce((s, f) => s + f.deaths, 0);
  const injuries = facts.reduce((s, f) => s + f.injuries, 0);
  const conflicts = facts.filter(isConflict).length;
  const lines = [
    `${conflicts} conflict events in ${facts.length} reports`,
    `${critical} critical / ${high} high priority beats`,
  ];
  if (deaths || injuries) lines.push(`${deaths} deaths, ${injuries} injuries in period`);
  const top = beats[0];
  if (top) lines.push(`Top beat: ${top.beat} (${top.tier}) — ${top.action.split(';')[0]}`);
  return lines;
}
