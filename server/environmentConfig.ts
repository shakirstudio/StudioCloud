import fs from 'fs';
import path from 'path';

export const PROD_PROJECT_ID = 'totemic-metric-wmzf6';
export const PROD_FIRESTORE_DB_ID = 'ai-studio-studiocloud-96ce23e4-825f-4ad2-98b0-7123de2321ac';
export const PROD_STORAGE_BUCKET = 'totemic-metric-wmzf6.firebasestorage.app';

export class StagingIsolationError extends Error {
  public status = 500;
  public code = 'STAGING_ISOLATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'StagingIsolationError';
  }
}

export interface AppletFirebaseConfig {
  projectId: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  isStaging: boolean;
}

let configOverride: AppletFirebaseConfig | null = null;

export function setFirebaseConfigOverrideForTesting(override: AppletFirebaseConfig | null) {
  configOverride = override;
}

/**
 * Resolves Firebase configuration with strict environment isolation.
 * In staging mode (APP_ENV === 'staging' or STAGING === 'true'),
 * it requires dedicated staging resource identifiers and strictly rejects
 * any production project ID, database ID, or storage bucket.
 */
export function resolveFirebaseConfig(): AppletFirebaseConfig {
  if (configOverride) {
    return configOverride;
  }

  const isStaging = process.env.APP_ENV === 'staging' || process.env.STAGING === 'true';

  if (isStaging) {
    const stagingConfigPath = process.env.STAGING_CONFIG_FILE 
      ? path.resolve(process.cwd(), process.env.STAGING_CONFIG_FILE)
      : path.resolve(process.cwd(), 'firebase-applet-config.staging.json');

    let stagingConfig: any = null;
    if (fs.existsSync(stagingConfigPath)) {
      try {
        stagingConfig = JSON.parse(fs.readFileSync(stagingConfigPath, 'utf8'));
      } catch (err: any) {
        throw new StagingIsolationError(`Failed to parse staging configuration at ${stagingConfigPath}: ${err.message}`);
      }
    }

    const projectId = process.env.STAGING_PROJECT_ID || stagingConfig?.projectId;
    const firestoreDatabaseId = process.env.STAGING_FIRESTORE_DATABASE_ID || stagingConfig?.firestoreDatabaseId;
    const storageBucket = process.env.STAGING_STORAGE_BUCKET || stagingConfig?.storageBucket;

    if (!projectId || !firestoreDatabaseId || !storageBucket) {
      throw new StagingIsolationError(
        'Staging environment active but missing dedicated staging configuration (projectId, firestoreDatabaseId, storageBucket). ' +
        'Cannot fall back to production resources. Please provide firebase-applet-config.staging.json or staging environment variables.'
      );
    }

    // STRICT ANTI-FALLBACK VALIDATION: Staging must NEVER target production resources
    if (projectId === PROD_PROJECT_ID) {
      throw new StagingIsolationError(
        `Staging isolation violation: Staging projectId cannot equal production project "${PROD_PROJECT_ID}".`
      );
    }
    if (firestoreDatabaseId === PROD_FIRESTORE_DB_ID) {
      throw new StagingIsolationError(
        `Staging isolation violation: Staging firestoreDatabaseId cannot equal production database "${PROD_FIRESTORE_DB_ID}".`
      );
    }
    if (storageBucket === PROD_STORAGE_BUCKET) {
      throw new StagingIsolationError(
        `Staging isolation violation: Staging storageBucket cannot equal production bucket "${PROD_STORAGE_BUCKET}".`
      );
    }

    return {
      projectId,
      firestoreDatabaseId,
      storageBucket,
      isStaging: true,
    };
  }

  // Production / default resolution
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        projectId: config.projectId || PROD_PROJECT_ID,
        firestoreDatabaseId: config.firestoreDatabaseId || PROD_FIRESTORE_DB_ID,
        storageBucket: config.storageBucket || PROD_STORAGE_BUCKET,
        isStaging: false,
      };
    }
  } catch {}

  return {
    projectId: PROD_PROJECT_ID,
    firestoreDatabaseId: PROD_FIRESTORE_DB_ID,
    storageBucket: PROD_STORAGE_BUCKET,
    isStaging: false,
  };
}
