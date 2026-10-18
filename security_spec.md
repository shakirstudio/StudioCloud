# StudioCloud Security Specification

## 1. Data Invariants
1. **Multi-Tenant Isolation**: Studio records (`/studios/{studioId}`) and their subcollections (`/clients`, `/galleries`, `/members`, `/activityLogs`) are strictly isolated. A user can only access a studio if they are an active member of that studio or a platform super administrator.
2. **Quota Invariant**: A studio cannot exceed its assigned `storageAllocationBytes` (default 10 GB = 10,737,418,240 bytes). Storage quota fields cannot be modified arbitrarily by non-admin studio members.
3. **Role-Based Authorization**:
   - `owner`: full studio administrative access (billing, branding, team invitations, gallery deletion).
   - `lead_photographer` / `associate_photographer`: can manage galleries and clients.
   - `retoucher` / `assistant`: can view galleries and upload assets, cannot alter studio billing/tenant configs.
4. **Super Admin Isolation**: Platform-level overview and cross-studio inspection is strictly limited to verified platform administrators registered in `/admins/{adminId}` or runtime admin email (`shakirtamboli.pune@gmail.com`). Normal photographers and staff cannot access super admin endpoints or other studios' documents.
5. **No Cross-Tenant Leaks**: Listing `/studios` without superadmin access is prohibited. Normal queries must resolve strictly to the user's authorized studio.

## 2. The "Dirty Dozen" Threat Payloads
1. **Payload 1 (Cross-Tenant Client Read)**: User A (Tenant Studio 1) queries `/studios/studio-2/clients/client-99`. Target: MUST fail with PERMISSION_DENIED.
2. **Payload 2 (Cross-Tenant Gallery Mutation)**: User A attempts to `create` `/studios/studio-2/galleries/gal-1`. Target: MUST fail with PERMISSION_DENIED.
3. **Payload 3 (Unauthorized Quota Escalation)**: Regular studio member attempts to update `storageAllocationBytes` on `/studios/studio-1` to 100 TB. Target: MUST fail with PERMISSION_DENIED.
4. **Payload 4 (Super Admin Impersonation)**: Unprivileged user creates a document in `/admins/{uid}` to self-grant super admin status. Target: MUST fail with PERMISSION_DENIED.
5. **Payload 5 (Unauthenticated Data Harvest)**: Unauthenticated visitor calls `list` on `/studios` or `/studios/studio-1/clients`. Target: MUST fail with PERMISSION_DENIED.
6. **Payload 6 (Shadow Field Injection)**: Tenant attempts to create a studio with injected privilege flag `isSuperAdmin: true` or `vipPass: true`. Target: MUST fail with validation rejection.
7. **Payload 7 (Path Traversal / Junk ID Attack)**: Attacker passes 2KB junk character string as `studioId` or `galleryId`. Target: Blocked by `isValidId()`.
8. **Payload 8 (Owner Takeover)**: Non-owner studio member attempts to update `ownerId` of the studio document. Target: Denied by immutability check `incoming().ownerId == existing().ownerId`.
9. **Payload 9 (Deleted Member Sub-Resource Access)**: Revoked member whose status was set to 'inactive' or deleted attempts to read gallery collections. Target: Blocked by Master Gate member verification.
10. **Payload 10 (Activity Log Tampering)**: Member attempts to delete or alter past `activityLogs` audit trail. Target: MUST reject update/delete on activityLogs.
11. **Payload 11 (Client PII Exfiltration)**: User without studio membership attempts to list `/studios/studio-1/clients`. Target: PERMISSION_DENIED.
12. **Payload 12 (Negative Storage Injection)**: Malicious client sends negative `storageUsedBytes: -999999999`. Target: Blocked by numeric boundary validations.
