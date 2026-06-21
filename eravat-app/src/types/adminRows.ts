// Shapes of the joined rows the admin dashboards select from Supabase.
// The client is untyped, so these are structural annotations for the
// row-mapping lambdas (replaces scattered `any`s — QA M-7).

export interface AdminObservationRow {
    type: string | null;
    conflict_loss_details: string[] | null;
}

export interface AdminDamageRow {
    category: string | null;
}

export interface AdminGeoBeatJoin {
    name?: string | null;
    geo_ranges?: {
        name?: string | null;
        geo_divisions?: { id?: string; name?: string | null } | null;
    } | null;
}

export interface AdminReportRow {
    id: string;
    device_timestamp: string;
    server_created_at?: string | null;
    beat_id?: string | null;
    observations?: AdminObservationRow[] | null;
    conflict_damages?: AdminDamageRow[] | null;
    geo_beats?: AdminGeoBeatJoin | null;
    profiles?: {
        first_name?: string | null;
        last_name?: string | null;
        phone?: string | null;
    } | null;
}
