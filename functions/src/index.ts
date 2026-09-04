import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

admin.initializeApp();

const db = admin.firestore();
const secretsManager = functions.runWith({
  serviceAccount: 'reelforge-secrets-manager@reelforge-4b07d.iam.gserviceaccount.com',
});

let secretManager: import('@google-cloud/secret-manager').SecretManagerServiceClient | null = null;
function getSecretManager(): import('@google-cloud/secret-manager').SecretManagerServiceClient {
  if (!secretManager) {
    const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
    secretManager = new SecretManagerServiceClient();
  }
  return secretManager!;
}

const SERVICE_NAMES: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  elevenlabs: 'ElevenLabs',
  falai: 'fal.ai',
  synclabs: 'Sync Labs',
};

function getProjectId(): string {
  return admin.instanceId().app.options.projectId ?? process.env.GCLOUD_PROJECT ?? '';
}

function secretIdForUserService(userId: string, serviceId: string): string {
  const hash = createHash('sha256').update(userId).digest('hex');
  return `reelforge_apikey_u${hash}_${serviceId}`;
}

function secretName(userId: string, serviceId: string): string {
  const projectId = getProjectId();
  return `projects/${projectId}/secrets/${secretIdForUserService(userId, serviceId)}`;
}

async function secretExists(name: string): Promise<boolean> {
  try {
    await getSecretManager().getSecret({ name });
    return true;
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 5) return false;
    throw err;
  }
}

async function createSecret(name: string, secretId: string, payload: string): Promise<string> {
  const [secret] = await getSecretManager().createSecret({
    parent: name.replace(/\/secrets\/[^/]+$/, ''),
    secretId,
    secret: {
      replication: {
        automatic: {},
      },
    },
  });
  await getSecretManager().addSecretVersion({
    parent: secret.name ?? name,
    payload: {
      data: Buffer.from(payload, 'utf8'),
    },
  });
  return secret.name ?? name;
}

async function updateSecret(name: string, payload: string): Promise<string> {
  const [version] = await getSecretManager().addSecretVersion({
    parent: name,
    payload: {
      data: Buffer.from(payload, 'utf8'),
    },
  });

  // Disable older versions so only the latest is usable.
  const [versions] = await getSecretManager().listSecretVersions({ parent: name });
  const latestName = version.name;
  for (const v of versions) {
    if (v.name === latestName) continue;
    if (v.state === 'ENABLED') {
      await getSecretManager().disableSecretVersion({ name: v.name });
    }
  }
  return version.name ?? name;
}

async function deleteSecret(name: string): Promise<void> {
  // Delete all enabled versions, then delete the secret.
  const [versions] = await getSecretManager().listSecretVersions({ parent: name });
  for (const v of versions) {
    if (v.state === 'ENABLED' || v.state === 'DISABLED') {
      await getSecretManager().destroySecretVersion({ name: v.name });
    }
  }
  await getSecretManager().deleteSecret({ name });
}

export const saveApiKey = secretsManager.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const userId = context.auth.uid;
  const serviceId = data?.serviceId as string | undefined;
  const key = data?.key as string | undefined;

  if (!serviceId || typeof serviceId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'serviceId is required.');
  }
  if (key === undefined || typeof key !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'key is required.');
  }

  const serviceName = SERVICE_NAMES[serviceId] ?? serviceId;
  const secretId = secretIdForUserService(userId, serviceId);
  const name = secretName(userId, serviceId);

  let secretRef: string;
  if (await secretExists(name)) {
    await updateSecret(name, key);
    secretRef = name;
  } else {
    secretRef = await createSecret(name, secretId, key);
  }

  await db.collection('users').doc(userId).collection('apiKeys').doc(serviceId).set({
    serviceName,
    secretRef,
    connected: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, serviceId };
});

export const deleteApiKey = secretsManager.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const userId = context.auth.uid;
  const serviceId = data?.serviceId as string | undefined;

  if (!serviceId || typeof serviceId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'serviceId is required.');
  }

  const serviceName = SERVICE_NAMES[serviceId] ?? serviceId;
  const name = secretName(userId, serviceId);

  if (await secretExists(name)) {
    await deleteSecret(name);
  }

  await db.collection('users').doc(userId).collection('apiKeys').doc(serviceId).set({
    serviceName,
    secretRef: null,
    connected: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, serviceId };
});
