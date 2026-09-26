/**
 * ACL roles, as MeshCore firmware ClientACL.h: the role is the low two bits of
 * the permissions byte. The upper bits are kept when a role changes.
 */
export const ACL_ROLE_MASK = 0x03;

export type AclRoleName = 'guest' | 'read_only' | 'read_write' | 'admin';

/** Roles an entry can be given. Guest (0) removes an entry, so it is not offered. */
export const ACL_ASSIGNABLE_ROLES: { value: number; name: AclRoleName; label: string }[] = [
  { value: 3, name: 'admin', label: 'Admin' },
  { value: 2, name: 'read_write', label: 'Read-write' },
  { value: 1, name: 'read_only', label: 'Read-only' },
];

const ROLE_LABELS: Record<AclRoleName, string> = {
  admin: 'Admin',
  read_write: 'Read-write',
  read_only: 'Read-only',
  guest: 'Guest',
};

export function aclRoleLabel(name: string | undefined): string {
  return ROLE_LABELS[name as AclRoleName] ?? name ?? 'Unknown';
}

export function aclRoleBadgeClass(name: string | undefined): string {
  if (name === 'admin') return 'bg-accent-green/opacity-medium text-accent-green';
  if (name === 'read_write') return 'bg-primary/opacity-medium text-primary';
  return 'bg-secondary/opacity-medium text-secondary';
}

/** The permissions byte with its role replaced and its upper bits kept. */
export function withAclRole(permissionsValue: number | undefined, role: number): number {
  return ((permissionsValue ?? 0) & ~ACL_ROLE_MASK & 0xff) | (role & ACL_ROLE_MASK);
}

/**
 * A full public key from pasted text: 64 hex characters, ignoring spaces,
 * colons and a 0x prefix. Returns null when it is not one.
 */
export function normalizePublicKey(text: string): string | null {
  const hex = text.trim().replace(/^0x/i, '').replace(/[\s:]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}
