import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createHash, randomBytes } from 'crypto';
import axios from 'axios';
import { z } from 'zod';
import {
  getSecretValue,
  logUsage,
  projectPath,
  sendPushToUser,
  withProjectError,
} from './pipeline';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'reelforge-4b07d';
const REGION = process.env.FUNCTION_REGION ?? 'us-central1';
const OAUTH_CALLBACK_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/youtubeOAuthCallback`;
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID ?? '';
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET ?? '';
const STITCH_SERVICE_URL = process.env.STITCH_SERVICE_URL || '';
const UPLOAD_SERVICE_URL = STITCH_SERVICE_URL ? STITCH_SERVICE_URL.replace(/\/stitch\/?$/, '/upload') : '';

const pipeline = functions.runWith({
  serviceAccount: 'reelforge-pipeline@reelforge-4b07d.iam.gserviceaccount.com',
  timeoutSeconds: 300,
  memory: '1GB',
});

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

function secretIdForUserService(userId: string, serviceId: string): string {
  const hash = createHash('sha256').update(userId).digest('hex');
  return `reelforge_apikey_u${hash}_${serviceId}`;
}

function secretNameForUserService(userId: string, serviceId: string): string {
  return `projects/${PROJECT_ID}/secrets/${secretIdForUserService(userId, serviceId)}`;
}

async function upsertSecret(userId: string, serviceId: string, payload: string): Promise<string> {
  const secretId = secretIdForUserService(userId, serviceId);
  const name = secretNameForUserService(userId, serviceId);
  const parent = name.replace(/\/secrets\/[^/]+$/, '');

  let exists = false;
  try {
    await getSecretManager().getSecret({ name });
    exists = true;
  } catch (err) {
    if ((err as { code?: number }).code !== 5) throw err;
  }

  if (!exists) {
    const [secret] = await getSecretManager().createSecret({
      parent,
      secretId,
      secret: { replication: { automatic: {} } },
    });
    await getSecretManager().addSecretVersion({
      parent: secret.name ?? name,
      payload: { data: Buffer.from(payload, 'utf8') },
    });
    return secret.name ?? name;
  }

  const [version] = await getSecretManager().addSecretVersion({
    parent: name,
    payload: { data: Buffer.from(payload, 'utf8') },
  });
  const [versions] = await getSecretManager().listSecretVersions({ parent: name });
  for (const v of versions) {
    if (v.name !== version.name && v.state === 'ENABLED') {
      await getSecretManager().disableSecretVersion({ name: v.name });
    }
  }
  return version.name ?? name;
}

async function getYoutubeAccessToken(userId: string): Promise<string> {
  const refreshToken = await getSecretValue(userId, 'youtube');
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    throw new Error('YouTube OAuth client is not configured.');
  }
  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
  );
  const accessToken = res.data?.access_token as string | undefined;
  if (!accessToken) throw new Error('Failed to refresh YouTube access token.');
  return accessToken;
}

export const youtubeAuthUrl = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    throw new functions.https.HttpsError('failed-precondition', 'YouTube OAuth is not configured.');
  }
  const userId = context.auth.uid;
  const nonce = randomBytes(16).toString('hex');
  await db.collection('users').doc(userId).set({ youtubeOAuthNonce: nonce }, { merge: true });
  const params = new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID,
    redirect_uri: OAUTH_CALLBACK_URL,
    response_type: 'code',
    scope: YOUTUBE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: `${userId}:${nonce}`,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
});

export const youtubeOAuthCallback = secretsManager.https.onRequest(async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    res.status(400).send(`<html><body><h2>YouTube connection failed</h2><p>${error}</p></body></html>`);
    return;
  }
  if (!code || !state) {
    res.status(400).send('<html><body><h2>Missing code or state</h2></body></html>');
    return;
  }

  const [userId, nonce] = state.split(':');
  if (!userId || !nonce) {
    res.status(400).send('<html><body><h2>Invalid state</h2></body></html>');
    return;
  }

  const userSnap = await db.collection('users').doc(userId).get();
  const storedNonce = (userSnap.data() as Record<string, unknown> | undefined)?.youtubeOAuthNonce;
  if (!storedNonce || storedNonce !== nonce) {
    res.status(403).send('<html><body><h2>Invalid state</h2></body></html>');
    return;
  }

  try {
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: OAUTH_CALLBACK_URL,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
    );
    const refreshToken = tokenRes.data?.refresh_token as string | undefined;
    if (!refreshToken) {
      throw new Error('Google did not return a refresh token. Ensure the OAuth client is configured for offline access.');
    }

    const secretRef = await upsertSecret(userId, 'youtube', refreshToken);
    await db.collection('users').doc(userId).collection('apiKeys').doc('youtube').set({
      serviceName: 'YouTube',
      secretRef,
      connected: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(userId).update({
      youtubeOAuthNonce: admin.firestore.FieldValue.delete(),
    });

    res.send('<html><body><h2>YouTube connected</h2><p>You can close this window and return to Reelforge.</p></body></html>');
  } catch (err) {
    res.status(500).send(`<html><body><h2>YouTube connection failed</h2><p>${(err as Error).message}</p></body></html>`);
  }
});

const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

function buildMetadataTool() {
  return {
    name: 'return_metadata',
    description: 'Return the YouTube metadata draft.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'description', 'tags'],
    } as any,
  };
}

export const generateVideoMetadata = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const projectId = data?.projectId as string | undefined;
  if (!projectId) {
    throw new functions.https.HttpsError('invalid-argument', 'projectId is required.');
  }

  const projectSnap = await projectPath(userId, projectId).get();
  if (!projectSnap.exists) throw new functions.https.HttpsError('not-found', 'Project not found.');
  const project = projectSnap.data() as Record<string, unknown>;

  if (project.status !== 'approved' && project.status !== 'pending_review' && project.status !== 'uploaded') {
    throw new functions.https.HttpsError('failed-precondition', 'Project must be approved before generating metadata.');
  }

  const scenesSnap = await projectPath(userId, projectId).collection('scenes').orderBy('order').get();
  const sceneScripts = scenesSnap.docs.map((d) => (d.data() as Record<string, unknown>).script as string).filter(Boolean);
  const characters = ((project.characters as { name: string; description?: string }[]) ?? [])
    .map((c) => `${c.name}: ${c.description ?? ''}`)
    .join('\n');
  const idea = (project.idea as string) ?? (project.title as string) ?? '';
  const genre = (project.genre as string) ?? '';

  const anthropicKey = await getSecretValue(userId, 'anthropic');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';

  const prompt = [
    'You are a YouTube metadata writer.',
    `Story idea: ${idea}`,
    `Genre: ${genre || 'unspecified'}`,
    `Characters:\n${characters}`,
    `Scene scripts:\n${sceneScripts.join('\n---\n')}`,
    'Write a catchy title, a short description, and 5-10 relevant tags. Keep the title under 100 characters.',
    'Return the result using the return_metadata tool.',
  ].join('\n\n');

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      tools: [buildMetadataTool()],
      tool_choice: { type: 'tool', name: 'return_metadata' } as any,
    });
    const toolUse = (response.content as any[]).find((c: any) => c.type === 'tool_use' && c.name === 'return_metadata');
    if (!toolUse) throw new Error('Claude did not return metadata.');
    const parsed = metadataSchema.parse(toolUse.input as unknown);

    const usage = (response as any).usage as { input_tokens?: number; output_tokens?: number } | undefined;
    await logUsage(userId, projectId, {
      service: 'anthropic',
      operation: 'generateVideoMetadata',
      units: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
      },
      estimatedCostUsd: 0,
    });

    await projectPath(userId, projectId).update({
      youtubeDraft: {
        title: parsed.title,
        description: parsed.description,
        tags: parsed.tags,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { title: parsed.title, description: parsed.description, tags: parsed.tags };
  } catch (err) {
    await withProjectError(userId, projectId, err);
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});

export const uploadToYoutube = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const projectId = data?.projectId as string | undefined;
  const title = data?.title as string | undefined;
  const description = data?.description as string | undefined;
  const tags = (data?.tags as string[] | undefined) ?? [];
  const visibility = (data?.visibility as string | undefined) ?? 'private';

  if (!projectId) {
    throw new functions.https.HttpsError('invalid-argument', 'projectId is required.');
  }
  if (!title) {
    throw new functions.https.HttpsError('invalid-argument', 'title is required.');
  }
  if (!UPLOAD_SERVICE_URL) {
    throw new functions.https.HttpsError('failed-precondition', 'Upload service URL is not configured.');
  }

  const projectSnap = await projectPath(userId, projectId).get();
  if (!projectSnap.exists) throw new functions.https.HttpsError('not-found', 'Project not found.');
  const project = projectSnap.data() as Record<string, unknown>;
  if (project.status !== 'approved') {
    throw new functions.https.HttpsError('failed-precondition', 'Project must be approved before publishing.');
  }
  const storagePath = (project.finalVideoUrl as string | undefined) ?? '';
  if (!storagePath) {
    throw new functions.https.HttpsError('failed-precondition', 'Project has no stitched video to upload.');
  }

  // Daily upload counter (soft warning only).
  const today = new Date().toISOString().slice(0, 10);
  const statsRef = db.collection('users').doc(userId).collection('uploadStats').doc('daily');
  const statsSnap = await statsRef.get();
  const stats = statsSnap.data() as Record<string, unknown> | undefined;
  const currentCount = stats?.date === today ? ((stats?.count as number) ?? 0) : 0;
  const warning = currentCount >= 5;

  try {
    const accessToken = await getYoutubeAccessToken(userId);
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(UPLOAD_SERVICE_URL);

    const res = (await client.request({
      method: 'POST',
      url: UPLOAD_SERVICE_URL,
      data: {
        userId,
        projectId,
        storagePath,
        accessToken,
        metadata: { title, description: description ?? '', tags, privacyStatus: visibility },
      },
      timeout: 300000,
    })) as any;

    const videoId = res.data?.videoId as string | undefined;
    const resultVisibility = (res.data?.visibility as string | undefined) ?? visibility;
    const downgraded = (res.data?.downgraded as boolean | undefined) ?? false;
    if (!videoId) throw new Error('YouTube upload did not return a video id.');

    await projectPath(userId, projectId).update({
      youtubeVideoId: videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      youtubeVisibility: resultVisibility,
      youtubeVisibilityDowngraded: downgraded,
      status: 'uploaded',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: admin.firestore.FieldValue.delete(),
    });

    await statsRef.set(
      {
        date: today,
        count: admin.firestore.FieldValue.increment(1),
      },
      { merge: true }
    );

    await sendPushToUser(
      userId,
      'Video uploaded to YouTube',
      `Your video "${title}" is now on YouTube.`,
      { projectId, screen: 'ProjectDetail' }
    );

    return {
      videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      visibility: resultVisibility,
      downgraded,
      warning: warning ? 'You have uploaded several videos today. YouTube daily quotas may be limited.' : undefined,
    };
  } catch (err) {
    await projectPath(userId, projectId).update({
      lastError: err instanceof Error ? err.message : 'YouTube upload failed.',
    });
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});
