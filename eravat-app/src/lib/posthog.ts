import posthog from 'posthog-js'

const projectToken = (import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined)?.trim()
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim()

if (!projectToken) {
  if (import.meta.env.DEV) {
    throw new Error('VITE_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_PROJECT_TOKEN is configured')
  }
} else if (!host) {
  if (import.meta.env.DEV) {
    throw new Error('VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured')
  }
} else if (typeof window !== 'undefined') {
  posthog.init(projectToken, {
    api_host: host,
  })
  posthog.startExceptionAutocapture()
}

const posthogClient: Pick<typeof posthog, 'capture' | 'captureException' | 'get_property' | 'identify' | 'reset'> =
  projectToken && host && typeof window !== 'undefined'
    ? posthog
    : {
        capture: () => undefined,
        captureException: () => undefined,
        get_property: () => undefined,
        identify: () => undefined,
        reset: () => undefined,
      }

export default posthogClient
