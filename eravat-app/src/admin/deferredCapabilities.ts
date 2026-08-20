export type DeferredCapabilityId =
    | 'voice_call_alerts'
    | 'communication_hub'
    | 'electric_fence'
    | 'crowd_data'
    | 'help_requests'
    | 'blog_cms'
    | 'device_management'
    | 'odk_forms'
    | 'category_master'
    | 'master_records'
    | 'villager_accounts'
    | 'affected_villagers'
    | 'kml_overlays'
    | 'notification_credits';

export interface DeferredCapability {
    id: DeferredCapabilityId;
    labelKey: string;
    reason: string;
}

/** Capabilities visible in the reference admin but not yet backed by Eravat architecture. */
export const DEFERRED_CAPABILITIES: DeferredCapability[] = [
    {
        id: 'voice_call_alerts',
        labelKey: 'admin.deferred.voiceCalls',
        reason: 'No voice dispatch pipeline or call_log table yet.',
    },
    {
        id: 'communication_hub',
        labelKey: 'admin.deferred.communication',
        reason: 'No multi-channel communication service beyond in-app push notifications.',
    },
    {
        id: 'electric_fence',
        labelKey: 'admin.deferred.electricFence',
        reason: 'No IoT fence telemetry schema or device ingest.',
    },
    {
        id: 'crowd_data',
        labelKey: 'admin.deferred.crowdData',
        reason: 'No public villager reporting channel separate from field personnel.',
    },
    {
        id: 'help_requests',
        labelKey: 'admin.deferred.helpRequests',
        reason: 'No ticketing / help_request table.',
    },
    {
        id: 'blog_cms',
        labelKey: 'admin.deferred.blog',
        reason: 'No content management tables.',
    },
    {
        id: 'device_management',
        labelKey: 'admin.deferred.devices',
        reason: 'No registered field device inventory.',
    },
    {
        id: 'odk_forms',
        labelKey: 'admin.deferred.odkForms',
        reason: 'No ODK integration layer.',
    },
    {
        id: 'category_master',
        labelKey: 'admin.deferred.categories',
        reason: 'Observation categories are enum-driven, not admin-configurable.',
    },
    {
        id: 'master_records',
        labelKey: 'admin.deferred.masterRecords',
        reason: 'Geography is managed via Divisions page; no generic master-record editor.',
    },
    {
        id: 'villager_accounts',
        labelKey: 'admin.deferred.villagers',
        reason: 'Registry CRUD is live at /admin/villagers. Villager app login / auth profiles remain out of scope.',
    },
    {
        id: 'affected_villagers',
        labelKey: 'admin.deferred.affectedVillagers',
        reason: 'Geo match queues villager_alert_events (sms_queued). Live SMS/voice send is still off on staging.',
    },
    {
        id: 'kml_overlays',
        labelKey: 'admin.deferred.kml',
        reason: 'Map uses live report pins; no KML layer storage.',
    },
    {
        id: 'notification_credits',
        labelKey: 'admin.deferred.credits',
        reason: 'No billing / SMS credit accounting.',
    },
];

export function isDeferredCapability(id: DeferredCapabilityId): boolean {
    return DEFERRED_CAPABILITIES.some((c) => c.id === id);
}
