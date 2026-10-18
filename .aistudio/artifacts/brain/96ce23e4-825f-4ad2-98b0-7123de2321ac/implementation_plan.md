# StudioCloud: Gallery Access, Proofing Integrity & Security Boundary Hardening Plan (Revised - Option A)

**Status:** Revised Proposed Architecture & Implementation Plan (Pre-Implementation Review)  
**Selected Architecture:** Option A — Trusted Backend Proxy for Protected Gallery Metadata, Media, and Proofing Operations  
**Rejected Architecture:** Option B — Server-Created Firestore Access Grants (rejected due to direct-read password disclosure and lack of elevated server-write credentials)  
**Safety Invariant:** Read-Only Planning Stage — No code, database records, security rules, or authentication configurations will be modified or deployed until explicit user approval.  

---

## 1. Executive Resolution of Safety Gate Items

| # | Safety Gate Item | Resolution & Architecture Decision |
| :--- | :--- | :--- |
| **1** | **Explicit Architecture Choice** | **Option A (Trusted Backend Proxy)** is selected. Option B is formally rejected. There is no mixing of approaches: browser clients do NOT write access grants, and browser clients do NOT directly read unlisted or password-protected Firestore documents. |
| **2** | **Bypass Prevention** | In `firestore.rules`, direct client reads (`allow get, list`) for `unlisted` and `password_protected` galleries, media, and proofing are completely eliminated. Any direct `db.getDoc()` or `db.getDocs()` call from the browser SDK fails with `PERMISSION_DENIED`. All access is routed through authenticated server endpoints. |
| **3** | **Access Grant Rationale** | Documented why Option B was rejected: Firestore cannot redact individual document fields (`accessPassword`, `shareToken`), and elevated Cloud Run service account credentials to bypass rules are unavailable. Option A eliminates both problems entirely. |
| **4** | **Firebase ID Token Validation** | Complete cryptographic verification module in `server.ts` utilizing Node's native `crypto` and Google public JWKS x509 certificates. Validates `alg=RS256`, `kid`, `aud`, `iss`, `sub`, `exp`, `auth_time`, and clock skew. |
| **5** | **Test Classification** | Every test is explicitly classified into one of 4 tiers: Tier 1 (Static Assertion), Tier 2 (Backend Unit), Tier 3 (Simulated Rules), Tier 4 (Actual Firebase Authorization). Simulated tests are never labeled as live tests. |
| **6** | **Historical Proofing Preservation** | Zero schema or record deletions. Returning clients must authenticate with Firebase Auth and verify email ownership (`email_verified === true`) before claiming or modifying historical records, preventing unverified email takeover. |
| **7** | **Rollout & Rollback Plan** | Step-by-step phased rollout with zero downtime and instant 1-command rollback capability. |

---

## 2. Architecture Specification: Option A (Trusted Backend Proxy)

### 2.1 Architectural Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT BROWSER (GUEST)                           │
│  - Public Gallery: Reads directly from Firestore SDK (fast, cached).        │
│  - Protected Gallery (Unlisted / Password):                                 │
│    Direct Firestore SDK calls are BLOCKED (PERMISSION_DENIED).               │
│    Client sends request to Trusted Backend Proxy.                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       │ POST /api/gallery/client/view
                                       │ Headers: Authorization: Bearer <ID_TOKEN> (if authenticated)
                                       │ Body: { studioId, galleryId, shareToken, password }
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TRUSTED EXPRESS BACKEND (server.ts)                   │
│                                                                             │
│ 1. IP & Gallery Rate Limiting: Max 5 failed attempts per 15 min per IP.     │
│ 2. Firebase ID Token Verification: Validates RS256, aud, iss, sub, exp.     │
│ 3. Fetch Gallery Document: Internal authorized connection.                   │
│ 4. Expiration Enforcement: Compares gallery.expiresAt against server time.  │
│ 5. Publication Status Check: Verifies status == 'published'.                │
│ 6. Credential Verification:                                                 │
│    - If unlisted: crypto.timingSafeEqual(shareToken, gallery.shareToken)     │
│    - If password: crypto.timingSafeEqual(password, gallery.accessPassword)  │
│ 7. Strips Sensitive Fields: accessPassword and shareToken NEVER returned.   │
│ 8. Returns Sanitized Payload: Gallery metadata + authorized media items.    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       │ Proofing Actions
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  CLIENT PROOFING PIPELINE (server.ts)                       │
│                                                                             │
│ POST /api/gallery/client/proofing                                           │
│ 1. Extracts authenticated clientUid from verified Firebase ID token.         │
│ 2. Validates client authorization for target studioId and galleryId.        │
│ 3. For new proof: Binds clientUid = token.uid.                              │
│ 4. For existing proof: Verifies token.uid == proof.clientUid, OR for legacy  │
│    historical records, verifies token.email_verified && email match.        │
│ 5. Saves proofing record to Firestore via backend authority.                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Rejection Analysis for Option B

Option B (Server-created Firestore access grants) was evaluated and formally rejected for the following structural reasons:
1. **Field-Level Disclosure Vulnerability:** Firestore Security Rules operate at the document level. If a client is granted `allow get` on `/studios/{studioId}/galleries/{galleryId}` based on an access grant, Firestore returns the entire document, which contains `accessPassword` and `shareToken`. Any client could inspect the network payload in browser DevTools and extract the private password.
2. **Backend Write Authority Constraint:** In the Cloud Run environment, the backend runner lacks GCP IAM Firestore Admin rights to project `totemic-metric-wmzf6`. Writing grants server-side without a service account private key would require client-side grant writes (which violates tenant isolation) or complex proxying that defeats the purpose of direct reads.
3. **Query Complexity & Rule Evaluation Overhead:** Checking grant existence on every single media document in a gallery (`get(.../accessGrants/$(request.auth.uid))`) introduces cross-document read latency and Firestore rule evaluation limits.

Option A cleanly resolves all three issues.

---

## 3. Database Security Boundary: Hardened Firestore Rules

Under Option A, `firestore.rules` enforces strict database-level security boundaries:

```javascript
// Galleries subcollection
match /galleries/{galleryId} {
  // Direct reads strictly limited to superadmins, studio members, backend service,
  // OR genuinely public, published, unexpired galleries.
  allow get: if isValidId(galleryId) && (
    isSuperAdmin() ||
    isStudioMember(studioId) ||
    isTrustedBackend() || (
      resource.data.privacy == 'public' &&
      resource.data.status == 'published' &&
      (!('expiresAt' in resource.data) || resource.data.expiresAt == null || request.time < timestamp.date(resource.data.expiresAt))
    )
  );
  
  allow list: if isSuperAdmin() || isStudioMember(studioId) || isTrustedBackend();
  allow create, update: if isValidId(galleryId) && (isSuperAdmin() || isStudioMember(studioId) || isTrustedBackend());
  allow delete: if isValidId(galleryId) && (isSuperAdmin() || isStudioOwner(studioId));

  // Media items subcollection
  match /media/{mediaId} {
    allow get, list: if isValidId(mediaId) && (
      isSuperAdmin() ||
      isStudioMember(studioId) ||
      isTrustedBackend() || (
        get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.privacy == 'public' &&
        get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.status == 'published' &&
        (!('expiresAt' in get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data) ||
         get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.expiresAt == null ||
         request.time < timestamp.date(get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.expiresAt))
      )
    );
    allow create: if isValidId(mediaId) && (isSuperAdmin() || isStudioMember(studioId)) &&
      incoming().sizeBytes > 0 && incoming().sizeBytes <= 262144000;
    allow update, delete: if isValidId(mediaId) && (isSuperAdmin() || isStudioMember(studioId));
  }

  // Client Photo Proofing subcollection
  match /proofing/{proofId} {
    // Reads: studio members, superadmins, trusted backend, or public galleries
    allow get, list: if isValidId(proofId) && (
      isSuperAdmin() ||
      isStudioMember(studioId) ||
      isTrustedBackend() || (
        get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.privacy == 'public' &&
        get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.status == 'published' &&
        (!('expiresAt' in get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data) ||
         get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.expiresAt == null ||
         request.time < timestamp.date(get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.expiresAt))
      )
    );
    
    // Direct browser client writes are disabled. All proofing writes must go through
    // the trusted backend proxy to enforce identity binding and prevent impersonation.
    allow create, update: if isValidId(proofId) && (
      isSuperAdmin() ||
      isStudioMember(studioId) ||
      isTrustedBackend()
    );
    allow delete: if isValidId(proofId) && (isSuperAdmin() || isStudioMember(studioId));
  }
}
```

---

## 4. Cryptographic Firebase ID Token Verification Specification

### 4.1 Verification Architecture
Because the application runs in a container without a mounted GCP service account private key, token validation is implemented via a dedicated cryptographic module (`server/tokenVerifier.ts`) following Google's official OpenID Connect / Firebase Auth JWT verification standard:

1. **JWKS Certificate Fetching & Key Rotation:**
   - Endpoint: `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`
   - Cache Strategy: In-memory cache obeying the HTTP `Cache-Control: max-age=...` response header (typically 6–12 hours).
   - Rotation: If an incoming token specifies a `kid` not present in cache, the cache is immediately invalidated and fresh public keys are retrieved from Google.

2. **Cryptographic Signature Verification:**
   - Algorithm: RSA with SHA-256 (`RS256`). Tokens using `none`, `HS256`, or other algorithms are rejected immediately.
   - Mechanism: Node.js built-in `crypto.createVerify('RSA-SHA256')` using the x509 public certificate matching the token's header `kid`.

3. **Mandatory Claims Validation:**
   - `alg`: Must be `'RS256'`.
   - `kid`: Must correspond to an active certificate in Google's JWKS.
   - `aud`: Must strictly equal `'totemic-metric-wmzf6'` (the Firebase project ID).
   - `iss`: Must strictly equal `'https://securetoken.google.com/totemic-metric-wmzf6'`.
   - `sub`: Must be a non-empty string representing the user's Firebase UID.
   - `exp`: Unix timestamp in seconds; must be strictly greater than `Date.now() / 1000` (with a 5-minute clock-skew tolerance).
   - `auth_time`: Unix timestamp in seconds; must be in the past (`<= Date.now() / 1000 + 300`).

4. **Failure Modes & HTTP Status Codes:**
   - Missing Header: `401 Unauthorized` (`{ error: 'MISSING_AUTHORIZATION_HEADER' }`)
   - Invalid Format: `401 Unauthorized` (`{ error: 'MALFORMED_BEARER_TOKEN' }`)
   - Unknown Key ID: `401 Unauthorized` (`{ error: 'UNKNOWN_SIGNING_KEY' }`)
   - Signature Mismatch: `401 Unauthorized` (`{ error: 'INVALID_TOKEN_SIGNATURE' }`)
   - Wrong Project / Audience: `401 Unauthorized` (`{ error: 'INVALID_TOKEN_AUDIENCE' }`)
   - Expired Token: `401 Unauthorized` (`{ error: 'TOKEN_EXPIRED' }`)

---

## 5. Historical Proofing Data Preservation & Safe Reclaim Protocol

### 5.1 Preservation Invariant
- Existing proofing documents at `/studios/{studioId}/galleries/{galleryId}/proofing/{proofId}` are preserved intact.
- No documents, fields, or historical records will be deleted, migrated destructively, or overwritten.

### 5.2 Safe Returning Client Reclaim Flow
Historical proofing documents were keyed as `prf_{mediaId}_{cleanEmail}` and contained `{ mediaId, clientEmail, clientName, isFavorite, isInAlbum, comments }` without a `clientUid`.

To prevent hostile takeover by an attacker merely typing a victim's email:
1. **Unverified Input Rejected:** Supplying a client email in a form or payload does NOT establish identity.
2. **Authenticated Requirement:** To modify an existing proofing record, the client must provide a valid Firebase ID token.
3. **Email Verification Check:**
   - If the proofing record already has `clientUid`, modification is permitted ONLY if `token.uid === record.clientUid`.
   - If the proofing record has NO `clientUid` (legacy record):
     - The token claim `email_verified` must be `true`.
     - The token claim `email.toLowerCase()` must match `record.clientEmail.toLowerCase()`.
     - Upon successful verification, the record is permanently bound with:
       `clientUid: token.uid`, `claimedAt: new Date().toISOString()`, and `claimedByEmail: token.email`.
4. **Anonymous / Unverified Accounts:** Anonymous users or unverified email accounts receive a `403 Forbidden` (`{ error: 'EMAIL_VERIFICATION_REQUIRED', message: 'Please sign in with a verified email to access or edit your saved selections.' }`). They may create new temporary proofing selections bound strictly to their anonymous UID, but cannot claim historical email records.

---

## 6. Security Test Classification & Verification Strategy

Every assertion in the test suite is strictly categorized to eliminate ambiguity between static checks and live network verification:

| Test ID | Test Description | Category / Classification | Target Component |
| :--- | :--- | :--- | :--- |
| **TEST-01** | Verify `firestore.rules` removes `unlisted` and `password_protected` from public `allow get` | **Tier 1: Static Assertion** | `firestore.rules` AST/regex analysis |
| **TEST-02** | Verify `server.ts` routes strip `accessPassword` and `shareToken` from all response bodies | **Tier 1: Static Assertion** | `server.ts` response schema AST check |
| **TEST-03** | Verify constant-time comparison `crypto.timingSafeEqual` prevents timing side-channels | **Tier 2: Backend Unit Test** | `server/credentialUtils.ts` |
| **TEST-04** | Verify in-memory sliding-window rate limiter blocks after 5 failed attempts per IP | **Tier 2: Backend Unit Test** | `server/rateLimiter.ts` |
| **TEST-05** | Verify token verifier rejects forged tokens, mismatched audience, and expired timestamps | **Tier 2: Backend Unit Test** | `server/tokenVerifier.ts` |
| **TEST-06** | Verify gallery expiration logic rejects requests where `Date.now() > expiresAt` | **Tier 2: Backend Unit Test** | `server/galleryAuthorizer.ts` |
| **TEST-07** | Verify simulated guest rules context cannot read unlisted or password-protected galleries | **Tier 3: Simulated Rules Test** | Firestore security rules simulation engine |
| **TEST-08** | Verify simulated client without verified email cannot claim legacy proofing documents | **Tier 3: Simulated Rules Test** | Proofing identity rules simulation engine |
| **TEST-09** | Live API check: `POST /api/gallery/client/view` returns 403 on invalid password | **Tier 4: Actual Backend Test** | Live Express server HTTP network test |
| **TEST-10** | Live API check: `POST /api/gallery/client/view` returns 410 on expired gallery link | **Tier 4: Actual Backend Test** | Live Express server HTTP network test |
| **TEST-11** | Live API check: `POST /api/gallery/client/proofing` requires valid Firebase Bearer token | **Tier 4: Actual Backend Test** | Live Express server HTTP network test |

---

## 7. Exact Files to Modify

1. **`firestore.rules`**
   - Restrict `allow get` on `/galleries/{galleryId}`, `/media/{mediaId}`, and `/proofing/{proofId}` to public unexpired galleries or authenticated studio/admin/backend roles.
   - Remove `unlisted` and `password_protected` from client SDK readable permissions.
   - Restrict `/proofing` writes to studio members or trusted backend.

2. **`server.ts`**
   - Add `POST /api/gallery/client/view` (verifies credentials, rate-limits, returns sanitized metadata and media).
   - Add `POST /api/gallery/client/proofing` (creates/updates proofing with UID binding).
   - Add `GET /api/gallery/client/proofing` (fetches client-specific proofing items).
   - Mount token verification and rate limiting middleware.

3. **`server/tokenVerifier.ts` (New File)**
   - Standalone cryptographic Firebase ID token validator with JWKS key caching and claim verification.

4. **`src/services/proofingService.ts`**
   - Update `verifyGalleryAccess`, `getGalleryProofing`, and proofing write functions to use the backend proxy endpoints for protected galleries while maintaining direct SDK access for public galleries.

5. **`src/components/client/ClientGalleryView.tsx`**
   - Update gallery loading flow to route protected gallery fetches through `POST /api/gallery/client/view`.
   - Add verified-email banner for returning clients claiming legacy proofing records.

6. **`scripts/test-gallery-access-boundary.ts` (New File)**
   - Implements the 11-test suite with explicit Tier 1 to Tier 4 classifications and isolated execution.

---

## 8. Rollout Plan & Instant Rollback Strategy

### 8.1 Rollout Sequence
1. **Phase 1: Backend Implementation**
   - Implement `server/tokenVerifier.ts` and add proxy endpoints to `server.ts`.
   - Dev server handles verification and proofing requests alongside existing routes.
2. **Phase 2: Client Service Migration**
   - Update `proofingService.ts` and `ClientGalleryView.tsx` to communicate with backend proxy endpoints.
   - Verify all existing public and protected galleries function seamlessly in the UI.
3. **Phase 3: Database Security Rules Hardening**
   - Update `firestore.rules` with strict boundary conditions.
   - Run compilation and full test suite (`npm test`).
   - Deploy hardened rules via `deploy_firebase`.

### 8.2 Rollback Procedure
If any regression is detected:
1. Revert `firestore.rules` to the pre-audit version via git and redeploy with `deploy_firebase`.
2. Frontend and backend changes are backward-compatible and do not break historical data.
3. Rollback execution time: < 30 seconds.
