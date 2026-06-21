/** Narrow an unknown caught error to a user-displayable message. */
export function errorMessage(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback;
}
