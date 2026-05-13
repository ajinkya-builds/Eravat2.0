import { useCallback, useEffect, useRef, useState } from 'react';
import { subDays } from 'date-fns';
import {
    fetchDivisions,
    fetchAdminReports,
    type AdminFilters,
    type AdminReportRow,
    type GeoDivision,
} from '../services/adminAnalyticsService';
import { useAuth } from '../contexts/AuthContext';

const DIVISION_SCOPED_ROLES = new Set(['dfo', 'range_officer']);

export function useAdminFilters(defaultDays = 30) {
    const { profile } = useAuth();
    const divisionScoped = useRef(false);
    const [divisions, setDivisions] = useState<GeoDivision[]>([]);
    const [filters, setFilters] = useState<AdminFilters>({
        divisionId: null,
        startDate: subDays(new Date(), defaultDays),
        endDate: new Date(),
    });
    const [reports, setReports] = useState<AdminReportRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (divisionScoped.current) return;
        if (!profile?.division_id || !DIVISION_SCOPED_ROLES.has(profile.role)) return;
        divisionScoped.current = true;
        setFilters((prev) => ({ ...prev, divisionId: profile.division_id ?? null }));
    }, [profile?.division_id, profile?.role]);

    const loadDivisions = useCallback(async () => {
        try {
            const data = await fetchDivisions();
            setDivisions(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load divisions');
        }
    }, []);

    const loadReports = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchAdminReports(filters);
            setReports(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load reports');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { void loadDivisions(); }, [loadDivisions]);
    useEffect(() => { void loadReports(); }, [loadReports]);

    return {
        divisions,
        filters,
        setFilters,
        reports,
        loading,
        error,
        reload: loadReports,
    };
}
