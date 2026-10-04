import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';

export type OnboardingPermissions = {
  canAddHathiMitra: boolean;
  canAddVillager: boolean;
  loading: boolean;
};

const DENIED: OnboardingPermissions = {
  canAddHathiMitra: false,
  canAddVillager: false,
  loading: false,
};

/**
 * Current role's add flags from role_onboarding_config.
 * Fetch failure fails closed (both flags false).
 */
export function useOnboardingPermissions(): OnboardingPermissions {
  const { profile } = useAuth();
  const role = profile?.role;
  const [state, setState] = useState<OnboardingPermissions>({
    canAddHathiMitra: false,
    canAddVillager: false,
    loading: Boolean(role),
  });

  useEffect(() => {
    if (!role) {
      setState(DENIED);
      return;
    }

    let cancelled = false;
    // Drop the previous role's flags immediately so a role change cannot
    // briefly keep add buttons from the last user.
    setState({
      canAddHathiMitra: false,
      canAddVillager: false,
      loading: true,
    });

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('role_onboarding_config')
          .select('can_add_hathi_mitra, can_add_villager')
          .eq('role', role)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setState(DENIED);
          return;
        }
        setState({
          canAddHathiMitra: Boolean(data.can_add_hathi_mitra),
          canAddVillager: Boolean(data.can_add_villager),
          loading: false,
        });
      } catch {
        if (!cancelled) setState(DENIED);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role]);

  return state;
}
