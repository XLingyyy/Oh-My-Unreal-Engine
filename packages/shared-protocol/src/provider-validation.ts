export const PROVIDER_INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function validateProviderInstanceId(id: unknown): string | null {
  if (typeof id !== 'string' || id.length === 0) {
    return 'Provider instance ID must be a non-empty string';
  }
  if (id.length > 128) {
    return 'Provider instance ID must be at most 128 characters';
  }
  if (!PROVIDER_INSTANCE_ID_PATTERN.test(id)) {
    return 'Provider instance ID must match pattern: ^[A-Za-z0-9_-]{1,128}$';
  }
  return null;
}
