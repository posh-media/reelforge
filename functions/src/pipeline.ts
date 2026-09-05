import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express, { Request, Response } from 'express';
import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import axios from 'axios';
import { parseBuffer } from 'music-metadata';
import { estimateAnthropicCost, estimateElevenLabsCost, estimateFalCost, estimateSyncCost } from './pricing';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

let secretManager: import('@google-cloud/secret-manager').SecretManagerServiceClient | null = null;
function getSecretManager(): import('@google-cloud/secret-manager').SecretManagerServiceClient {
  if (!secretManager) {
    const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
    secretManager = new SecretManagerServiceClient();
  }
  return secretManager!;
}

async function getUserApiKeyRef(userId: string, serviceId: string): Promise<string> {
  const doc = await db.collection('users').doc(userId).collection('apiKeys').doc(serviceId).get();
  if (!doc.exists) throw new Error(`No API key saved for ${serviceId}.`);
  const data = doc.data() as Record<string, unknown>;
  if (data.connected !== true) throw new Error(`API key for ${serviceId} is not connected.`);
  const ref = (data.secretRef as string | undefined) ?? '';
  if (!ref) throw new Error(`No secret reference for ${serviceId}.`);
  return ref;
}

async function getSecretValue(userId: string, serviceId: string): Promise<string> {
  const secretRef = await getUserApiKeyRef(userId, serviceId);
  const [version] = await getSecretManager().accessSecretVersion({ name: `${secretRef}/versions/latest` });
  const payload = version.payload?.data;
  if (!payload) throw new Error(`Secret ${serviceId} has no payload.`);
  return Buffer.from(payload).toString('utf8');
}

const pipeline = functions.runWith({
  serviceAccount: 'reelforge-pipeline@reelforge-4b07d.iam.gserviceaccount.com',
  timeoutSeconds: 300,
  memory: '1GB',
});

const FAL_ENDPOINTS: Record<string, string> = {
  seedance: 'bytedance/seedance-2.0/text-to-video',
  kling: 'fal-ai/kling-video/o3/pro/text-to-video',
  veo: 'fal-ai/veo3.1',
};

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'reelforge-4b07d';
const FAL_WEBHOOK_URL = process.env.FAL_WEBHOOK_URL || `https://us-central1-${PROJECT_ID}.cloudfunctions.net/falWebhook`;
const FAL_JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';
const FAL_WEBHOOK_LEEWAY_SECONDS = 300;
const FAL_MAX_AGE_MINUTES = 20;
const FAL_RECONCILE_AGE_MINUTES = 2;

let falJwksCache: { keys: any[]; fetchedAt: number } | null = null;
async function getFalJwks(): Promise<any[]> {
  if (falJwksCache && Date.now() - falJwksCache.fetchedAt < 60 * 60 * 1000) {
    return falJwksCache.keys;
  }
  const res = await axios.get(FAL_JWKS_URL, { timeout: 15000 });
  const keys = (res.data?.keys ?? []) as any[];
  falJwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

const breakdownSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      suggestedVoiceDescription: z.string().optional(),
    })
  ),
  scenes: z.array(
    z.object({
      order: z.number(),
      script: z.string(),
      characterNames: z.array(z.string()),
      durationSeconds: z.number(),
      dialogue: z
        .array(z.object({ speaker: z.string(), line: z.string() }))
        .optional(),
    })
  ),
});

function buildBreakdownTool() {
  return {
    name: 'return_breakdown',
    description:
      'Return a structured scene breakdown for a short video project. Include a character list and an array of scenes. Each scene must include a script, the characters present, and an estimated duration in seconds. If multiple characters speak in a scene, return their dialogue as an ordered array of {speaker, line} entries.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        characters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              suggestedVoiceDescription: { type: 'string' },
            },
            required: ['name', 'description'],
          },
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order: { type: 'integer' },
              script: { type: 'string' },
              characterNames: { type: 'array', items: { type: 'string' } },
              durationSeconds: { type: 'integer' },
              dialogue: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    speaker: { type: 'string' },
                    line: { type: 'string' },
                  },
                  required: ['speaker', 'line'],
                },
              },
            },
            required: ['order', 'script', 'characterNames', 'durationSeconds'],
          },
        },
      },
      required: ['characters', 'scenes'],
    } as any,
  };
}

function projectPath(userId: string, projectId: string) {
  return db.collection('users').doc(userId).collection('projects').doc(projectId);
}

function scenePath(userId: string, projectId: string, sceneId: string) {
  return projectPath(userId, projectId).collection('scenes').doc(sceneId);
}

async function withProjectError(
  userId: string,
  projectId: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  await projectPath(userId, projectId).update({
    status: 'draft',
    lastError: message,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function withSceneError(
  userId: string,
  projectId: string,
  sceneId: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  await scenePath(userId, projectId, sceneId).update({
    status: 'failed',
    lastError: message,
  });
}

async function logUsage(
  userId: string,
  projectId: string,
  entry: {
    service: string;
    operation: string;
    sceneId?: string;
    units?: Record<string, number>;
    estimatedCostUsd: number;
  }
): Promise<void> {
  if (entry.estimatedCostUsd <= 0) return;
  await projectPath(userId, projectId).collection('usageLogs').add({
    ...entry,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export const onUsageLogCreated = pipeline.firestore
  .document('users/{userId}/projects/{projectId}/usageLogs/{logId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() as Record<string, unknown> | undefined;
    const cost = (data?.estimatedCostUsd as number) ?? 0;
    if (!cost) return;
    const { userId, projectId } = context.params;
    await projectPath(userId, projectId).update({
      estimatedCostUsd: admin.firestore.FieldValue.increment(cost),
    });
  });

export const generateBreakdown = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const userId = context.auth.uid;
  const projectId = data?.projectId as string | undefined;
  if (!projectId || typeof projectId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'projectId is required.');
  }

  const projectSnap = await projectPath(userId, projectId).get();
  if (!projectSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Project not found.');
  }
  const project = projectSnap.data() as Record<string, unknown>;

  const idea = project.idea as string | undefined;
  if (!idea) {
    throw new functions.https.HttpsError('invalid-argument', 'Project idea is missing.');
  }

  const targetDurationSeconds = (project.targetDurationSeconds as number) ?? 300;
  const genre = (project.genre as string) ?? '';
  const anthropicKey = await getSecretValue(userId, 'anthropic');

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';

  const prompt = [
    'You are a screenwriter and director breaking a short story into video scenes.',
    `Story idea: ${idea}`,
    `Genre: ${genre || 'unspecified'}`,
    `Target total runtime: approximately ${targetDurationSeconds} seconds.`,
    'Split the story into scenes whose durations sum to roughly the target.',
    'For each scene, provide the full script/narration, the names of the characters present, and an estimated duration in seconds.',
    'If multiple characters speak in a scene, format their dialogue as an ordered array of {speaker, line} entries.',
    'Each character should also have a short description (appearance, voice, role).',
    'Return the result using the return_breakdown tool.',
  ].join('\n\n');

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
      tools: [buildBreakdownTool()],
      tool_choice: { type: 'tool', name: 'return_breakdown' } as any,
    });

    const toolUse = (response.content as any[]).find(
      (c: any) => c.type === 'tool_use' && c.name === 'return_breakdown'
    );
    if (!toolUse) throw new Error('Claude did not return a structured breakdown.');

    const parsed = breakdownSchema.parse(toolUse.input as unknown);

    const batch = db.batch();

    parsed.scenes.forEach((scene) => {
      const sceneRef = projectPath(userId, projectId).collection('scenes').doc();
      batch.set(sceneRef, {
        order: scene.order,
        script: scene.script,
        status: 'pending',
        characterNames: scene.characterNames,
        durationSeconds: scene.durationSeconds,
        dialogue: scene.dialogue ?? null,
      });
    });

    batch.update(projectPath(userId, projectId), {
      characters: parsed.characters,
      status: 'breakdown_ready',
      lastError: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    const usage = (response as any).usage as { input_tokens?: number; output_tokens?: number } | undefined;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    await logUsage(userId, projectId, {
      service: 'anthropic',
      operation: 'generateBreakdown',
      units: { inputTokens, outputTokens },
      estimatedCostUsd: estimateAnthropicCost(inputTokens, outputTokens),
    });

    return { success: true, projectId };
  } catch (err) {
    await withProjectError(userId, projectId, err);
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});

export const listVoices = pipeline.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const userId = context.auth.uid;
  const apiKey = await getSecretValue(userId, 'elevenlabs');

  try {
    const res = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
      timeout: 15000,
    });
    const voices = (res.data?.voices ?? []).map((v: any) => ({
      id: v.voice_id as string,
      name: v.name as string,
      previewUrl: (v.preview_url as string | undefined) ?? undefined,
    }));
    return { voices };
  } catch (err) {
    throw new functions.https.HttpsError(
      'internal',
      err instanceof Error ? err.message : 'Failed to fetch ElevenLabs voices'
    );
  }
});

async function callElevenLabsTTS(apiKey: string, voiceId: string, text: string): Promise<Buffer> {
  const res = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128',
    },
    {
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: 60000,
    }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

async function getAudioDuration(buffer: Buffer): Promise<number> {
  try {
    const meta = await parseBuffer(buffer, 'audio/mpeg');
    if (meta.format.duration && meta.format.duration > 0) {
      return meta.format.duration;
    }
  } catch (err) {
    console.warn('music-metadata duration failed, falling back to byte estimate:', (err as Error).message);
  }
  // Fallback: MP3 44100 128kbps CBR ~16 KB/s.
  return buffer.length / 16000;
}

async function doGenerateSceneVoice(
  userId: string,
  projectId: string,
  sceneId: string
): Promise<void> {
  const [projectSnap, sceneSnap] = await Promise.all([
    projectPath(userId, projectId).get(),
    scenePath(userId, projectId, sceneId).get(),
  ]);
  if (!projectSnap.exists || !sceneSnap.exists) return;

  const project = projectSnap.data() as Record<string, unknown>;
  const scene = sceneSnap.data() as Record<string, unknown>;
  const characters = ((project.characters as { name: string; voiceId?: string }[]) ?? []).filter(
    (c) => c.name && c.voiceId
  );

  if (characters.length === 0) {
    throw new Error('No characters with assigned voices.');
  }

  const characterVoice = (name: string) =>
    characters.find((c) => c.name.toLowerCase() === name.toLowerCase())?.voiceId ??
    characters[0].voiceId!;

  const apiKey = await getSecretValue(userId, 'elevenlabs');
  const dialogue = (scene.dialogue as { speaker: string; line: string }[] | undefined) ?? undefined;
  const sceneScript = (scene.script as string) ?? '';

  let audioBuffer: Buffer;
  let characterCount = 0;

  if (dialogue && dialogue.length > 0) {
    const buffers: Buffer[] = [];
    for (const line of dialogue) {
      const voiceId = characterVoice(line.speaker);
      const lineAudio = await callElevenLabsTTS(apiKey, voiceId, line.line);
      buffers.push(lineAudio);
      characterCount += line.line.length;
    }
    audioBuffer = Buffer.concat(buffers);
  } else {
    const characterName = ((scene.characterNames as string[]) ?? [])[0] ?? characters[0].name;
    const voiceId = characterVoice(characterName);
    audioBuffer = await callElevenLabsTTS(apiKey, voiceId, sceneScript);
    characterCount = sceneScript.length;
  }

  const storagePath = `users/${userId}/projects/${projectId}/scenes/${sceneId}/audio.mp3`;
  await storage
    .bucket()
    .file(storagePath)
    .save(audioBuffer, { contentType: 'audio/mpeg' });

  const duration = await getAudioDuration(audioBuffer);

  await logUsage(userId, projectId, {
    service: 'elevenlabs',
    operation: 'generateSceneVoice',
    sceneId,
    units: { characters: characterCount, durationSeconds: Math.round(duration) },
    estimatedCostUsd: estimateElevenLabsCost(characterCount),
  });

  await scenePath(userId, projectId, sceneId).update({
    audioUrl: storagePath,
    durationSeconds: Math.round(duration),
    status: 'voice_ready',
    lastError: admin.firestore.FieldValue.delete(),
  });
}

export const generateSceneVoice = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const projectId = data?.projectId as string | undefined;
  const sceneId = data?.sceneId as string | undefined;
  if (!projectId || !sceneId) {
    throw new functions.https.HttpsError('invalid-argument', 'projectId and sceneId are required.');
  }
  try {
    await doGenerateSceneVoice(userId, projectId, sceneId);
    return { success: true };
  } catch (err) {
    await withSceneError(userId, projectId, sceneId, err);
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});

async function doGenerateSceneVideo(
  userId: string,
  projectId: string,
  sceneId: string
): Promise<void> {
  const [projectSnap, sceneSnap] = await Promise.all([
    projectPath(userId, projectId).get(),
    scenePath(userId, projectId, sceneId).get(),
  ]);
  if (!projectSnap.exists || !sceneSnap.exists) return;

  const project = projectSnap.data() as Record<string, unknown>;
  const scene = sceneSnap.data() as Record<string, unknown>;

  const videoModel = (project.videoModel as string) ?? '';
  const endpoint = FAL_ENDPOINTS[videoModel];
  if (!endpoint) throw new Error(`Unknown video model: ${videoModel}`);

  const durationSeconds = Math.round((scene.durationSeconds as number) ?? 5);
  const clampedDuration = Math.min(Math.max(durationSeconds, 4), 15);

  const characters = (project.characters as { name: string; description?: string }[]) ?? [];
  const characterDesc = characters
    .map((c) => `${c.name}: ${c.description ?? ''}`)
    .join('\n');
  const sceneScript = (scene.script as string) ?? '';
  const prompt = [
    'Cinematic video scene. No audio, no dialogue sound, silent.',
    'Characters should appear to be speaking naturally, but their lips move without any sound.',
    `Scene: ${sceneScript}`,
    `Characters:\n${characterDesc}`,
    `Target duration: ${clampedDuration} seconds.`,
  ].join('\n\n');

  const falKey = await getSecretValue(userId, 'falai');
  const body: Record<string, any> = {
    prompt,
    duration: clampedDuration.toString(),
    resolution: '720p',
    aspect_ratio: '16:9',
    generate_audio: false,
    seed: Math.floor(Math.random() * 1000000),
  };
  if (FAL_WEBHOOK_URL) {
    body.webhook_url = FAL_WEBHOOK_URL;
  }

  const res = await axios.post(`https://queue.fal.run/${endpoint}`, body, {
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const requestId = res.data?.request_id as string | undefined;
  if (!requestId) throw new Error('fal queue did not return a request_id.');

  await scenePath(userId, projectId, sceneId).update({
    status: 'video_generating',
    falRequestId: requestId,
    falEndpoint: endpoint,
    falRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastError: admin.firestore.FieldValue.delete(),
  });
}

export const generateSceneVideo = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const projectId = data?.projectId as string | undefined;
  const sceneId = data?.sceneId as string | undefined;
  if (!projectId || !sceneId) {
    throw new functions.https.HttpsError('invalid-argument', 'projectId and sceneId are required.');
  }
  try {
    await doGenerateSceneVideo(userId, projectId, sceneId);
    return { success: true };
  } catch (err) {
    await withSceneError(userId, projectId, sceneId, err);
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});

export const onSceneUpdated = pipeline.firestore
  .document('users/{userId}/projects/{projectId}/scenes/{sceneId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as Record<string, unknown> | undefined;
    const after = change.after.data() as Record<string, unknown> | undefined;
    if (!before || !after) return;
    if (before.status === after.status) return;

    const { userId, projectId, sceneId } = context.params;
    const projectSnap = await projectPath(userId, projectId).get();
    if (!projectSnap.exists) return;
    const project = projectSnap.data() as Record<string, unknown>;

    const isProcessing = project.status === 'processing';
    const characters = (project.characters as { voiceId?: string }[]) ?? [];
    const allVoiced = characters.every((c) => c.voiceId);

    if (after.status === 'script_ready' && allVoiced && isProcessing) {
      try {
        await doGenerateSceneVoice(userId, projectId, sceneId);
      } catch (err) {
        await withSceneError(userId, projectId, sceneId, err);
      }
    }

    if (after.status === 'voice_ready') {
      try {
        await doGenerateSceneVideo(userId, projectId, sceneId);
      } catch (err) {
        await withSceneError(userId, projectId, sceneId, err);
      }
    }

    if (after.status === 'video_ready' && isProcessing) {
      try {
        await doGenerateSceneLipsync(userId, projectId, sceneId);
      } catch (err) {
        await withSceneError(userId, projectId, sceneId, err);
      }
    }
  });

function headerValue(headers: any, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] as string | undefined;
  return value as string | undefined;
}

async function verifyFalWebhook(rawBody: Buffer, headers: any): Promise<boolean> {
  const requestId = headerValue(headers, 'X-Fal-Webhook-Request-Id');
  const userId = headerValue(headers, 'X-Fal-Webhook-User-Id');
  const timestamp = headerValue(headers, 'X-Fal-Webhook-Timestamp');
  const signatureHex = headerValue(headers, 'X-Fal-Webhook-Signature');
  if (!requestId || !userId || !timestamp || !signatureHex) return false;

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > FAL_WEBHOOK_LEEWAY_SECONDS) return false;

  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const message = `${requestId}\n${userId}\n${timestamp}\n${bodyHash}`;
  const messageBuffer = Buffer.from(message, 'utf8');
  const signature = Buffer.from(signatureHex, 'hex');

  const jwks = await getFalJwks();
  for (const key of jwks) {
    if (!key.x) continue;
    try {
      const publicKey = createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: key.x as string },
        format: 'jwk',
      });
      if (verify('ed25519', messageBuffer, publicKey, signature)) {
        return true;
      }
    } catch {
      // try next key
    }
  }
  return false;
}

async function downloadAndStoreFalVideo(
  userId: string,
  projectId: string,
  sceneId: string,
  videoUrl: string
): Promise<string> {
  const videoRes = await axios.get(videoUrl, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });
  const videoBuffer = Buffer.from(videoRes.data as ArrayBuffer);
  const storagePath = `users/${userId}/projects/${projectId}/scenes/${sceneId}/video.mp4`;
  await storage.bucket().file(storagePath).save(videoBuffer, { contentType: 'video/mp4' });
  return storagePath;
}

async function finalizeFalVideo(requestId: string, error: string | undefined, videoUrl: string | undefined): Promise<void> {
  const snapshot = await db
    .collectionGroup('scenes')
    .where('falRequestId', '==', requestId)
    .where('status', '==', 'video_generating')
    .limit(1)
    .get();
  if (snapshot.empty) return;

  const doc = snapshot.docs[0];
  const pathParts = doc.ref.path.split('/');
  const userId = pathParts[1];
  const projectId = pathParts[3];
  const sceneId = pathParts[5];

  if (error) {
    await doc.ref.update({
      status: 'failed',
      lastError: error,
      falWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  if (!videoUrl) {
    await doc.ref.update({
      status: 'failed',
      lastError: 'fal webhook payload did not contain a video URL.',
      falWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  try {
    const storagePath = await downloadAndStoreFalVideo(userId, projectId, sceneId, videoUrl);
    await doc.ref.update({
      videoUrl: storagePath,
      status: 'video_ready',
      falWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: admin.firestore.FieldValue.delete(),
    });

    const projectSnap = await projectPath(userId, projectId).get();
    const videoModel = (projectSnap.data() as Record<string, unknown> | undefined)?.videoModel as string | undefined;
    const duration = ((doc.data() as Record<string, unknown>).durationSeconds as number) ?? 0;
    await logUsage(userId, projectId, {
      service: 'falai',
      operation: 'generateSceneVideo',
      sceneId,
      units: { durationSeconds: duration },
      estimatedCostUsd: estimateFalCost(videoModel ?? '', duration),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to download/store fal video.';
    await withSceneError(userId, projectId, sceneId, new Error(message));
  }
}

async function processFalWebhookPayload(rawBody: Buffer): Promise<void> {
  const parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, any>;
  const requestId = parsed.request_id as string | undefined;
  if (!requestId) return;

  const status = parsed.status as string | undefined;
  const output = parsed.payload ?? parsed.data;
  const videoUrl = output?.video?.url as string | undefined;
  const error = status === 'ERROR' ? ((parsed.error as string) ?? 'fal reported error.') : undefined;
  await finalizeFalVideo(requestId, error, videoUrl);
}

const STITCH_SERVICE_URL = process.env.STITCH_SERVICE_URL || '';

async function doStitchProject(userId: string, projectId: string): Promise<void> {
  const projectSnap = await projectPath(userId, projectId).get();
  if (!projectSnap.exists) throw new Error('Project not found.');

  const scenesSnap = await projectPath(userId, projectId).collection('scenes').orderBy('order').get();
  const scenePaths: string[] = [];
  for (const doc of scenesSnap.docs) {
    const scene = doc.data() as Record<string, unknown>;
    if (scene.status !== 'approved') {
      throw new Error('All scenes must be approved before stitching.');
    }
    const finalVideoUrl = (scene.finalVideoUrl as string | undefined) ?? '';
    if (!finalVideoUrl) {
      throw new Error('An approved scene is missing the final lip-synced video.');
    }
    scenePaths.push(finalVideoUrl);
  }

  if (scenePaths.length === 0) {
    throw new Error('No scenes to stitch.');
  }

  if (!STITCH_SERVICE_URL) {
    throw new Error('Stitch service URL is not configured.');
  }

  const outputPath = `users/${userId}/projects/${projectId}/final-video.mp4`;

  await projectPath(userId, projectId).update({
    status: 'processing',
    lastError: admin.firestore.FieldValue.delete(),
  });

  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(STITCH_SERVICE_URL);
    const res = (await client.request({
      method: 'POST',
      url: STITCH_SERVICE_URL,
      data: { userId, projectId, scenePaths, outputPath },
    })) as any;

    const finalVideoUrl = res.data?.finalVideoUrl as string | undefined;
    if (!finalVideoUrl) throw new Error('Stitch service did not return a final video URL.');

    await projectPath(userId, projectId).update({
      finalVideoUrl,
      status: 'pending_review',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: admin.firestore.FieldValue.delete(),
    });
  } catch (err) {
    await projectPath(userId, projectId).update({
      status: 'processing',
      lastError: err instanceof Error ? err.message : 'Stitch service failed.',
    });
    throw err;
  }
}

export const stitchProject = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const projectId = data?.projectId as string | undefined;
  if (!projectId) {
    throw new functions.https.HttpsError('invalid-argument', 'projectId is required.');
  }
  try {
    await doStitchProject(userId, projectId);
    return { success: true };
  } catch (err) {
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});

const falWebhookApp = express();
falWebhookApp.use(express.raw({ type: 'application/json' }));
falWebhookApp.post('/falWebhook', async (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;
  const verified = await verifyFalWebhook(rawBody, req.headers);
  if (!verified) {
    res.status(400).send('Invalid signature');
    return;
  }
  res.status(200).send('OK');
  // Process after responding to avoid webhook retries/timeouts.
  try {
    await processFalWebhookPayload(rawBody);
  } catch (err) {
    console.error('processFalWebhookPayload failed:', (err as Error).message);
  }
});

export const falWebhook = pipeline.https.onRequest(falWebhookApp);

export const regenerateScene = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const projectId = data?.projectId as string | undefined;
  const sceneId = data?.sceneId as string | undefined;
  if (!projectId || !sceneId) {
    throw new functions.https.HttpsError('invalid-argument', 'projectId and sceneId are required.');
  }

  const sceneSnap = await scenePath(userId, projectId, sceneId).get();
  if (!sceneSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Scene not found.');
  }
  const scene = sceneSnap.data() as Record<string, unknown>;
  const status = (scene.status as string) ?? 'pending';
  const hasAudio = !!(scene.audioUrl as string | undefined);
  const hasVideo = !!(scene.videoUrl as string | undefined);

  await scenePath(userId, projectId, sceneId).update({
    retryCount: 0,
    lastError: admin.firestore.FieldValue.delete(),
  });

  try {
    if (!hasAudio || status === 'pending' || status === 'script_ready' || status === 'rejected') {
      await doGenerateSceneVoice(userId, projectId, sceneId);
    } else if (hasAudio && (!hasVideo || status === 'voice_ready' || status === 'failed')) {
      await doGenerateSceneVideo(userId, projectId, sceneId);
    } else if (hasVideo) {
      await doGenerateSceneLipsync(userId, projectId, sceneId);
    } else {
      await doGenerateSceneVoice(userId, projectId, sceneId);
    }
    return { success: true };
  } catch (err) {
    await withSceneError(userId, projectId, sceneId, err);
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'object' && 'toMillis' in value && typeof (value as any).toMillis === 'function') {
    return (value as any).toMillis() as number;
  }
  if (typeof value === 'number') return value;
  return null;
}

const SYNC_BASE_URL = 'https://api.sync.so';
const SYNC_WEBHOOK_URL = process.env.SYNC_WEBHOOK_URL || `https://us-central1-${PROJECT_ID}.cloudfunctions.net/syncWebhook`;
const SYNC_RECONCILE_AGE_MINUTES = 2;
const SYNC_MAX_AGE_MINUTES = 30;

async function getSignedDownloadUrl(storagePath: string): Promise<string> {
  const [url] = await storage.bucket().file(storagePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000,
  });
  return url;
}

let syncSecretCache: Record<string, { secret: string; fetchedAt: number }> = {};
async function getSyncWebhookSecret(apiKey: string): Promise<string | null> {
  const cached = syncSecretCache[apiKey];
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) {
    return cached.secret;
  }
  try {
    const res = await axios.get(`${SYNC_BASE_URL}/v2/organizations/webhook/secret`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    const secret = (res.data?.secret as string | undefined) ?? null;
    if (secret) {
      syncSecretCache[apiKey] = { secret, fetchedAt: Date.now() };
    }
    return secret;
  } catch (err) {
    console.error('Failed to fetch Sync Labs webhook secret:', (err as Error).message);
    return null;
  }
}

async function verifySyncWebhook(rawBody: Buffer, signatureHeader: string | undefined, apiKey: string): Promise<boolean> {
  if (!signatureHeader) return false;
  const match = signatureHeader.match(/t=(\d+),v1=([a-f0-9]+)/);
  if (!match) return false;
  const [, timestamp, receivedSignature] = match;
  const secret = await getSyncWebhookSecret(apiKey);
  if (!secret) return false;
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const expectedSignature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

async function downloadAndStoreSyncVideo(
  userId: string,
  projectId: string,
  sceneId: string,
  videoUrl: string
): Promise<string> {
  const videoRes = await axios.get(videoUrl, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });
  const videoBuffer = Buffer.from(videoRes.data as ArrayBuffer);
  const storagePath = `users/${userId}/projects/${projectId}/scenes/${sceneId}/final.mp4`;
  await storage.bucket().file(storagePath).save(videoBuffer, { contentType: 'video/mp4' });
  return storagePath;
}

async function finalizeSyncVideo(
  syncGenerationId: string,
  error: string | undefined,
  videoUrl: string | undefined
): Promise<void> {
  const snapshot = await db
    .collectionGroup('scenes')
    .where('syncGenerationId', '==', syncGenerationId)
    .where('status', '==', 'lipsync_generating')
    .limit(1)
    .get();
  if (snapshot.empty) return;

  const doc = snapshot.docs[0];
  const pathParts = doc.ref.path.split('/');
  const userId = pathParts[1];
  const projectId = pathParts[3];
  const sceneId = pathParts[5];

  if (error) {
    await withSceneError(userId, projectId, sceneId, new Error(error));
    return;
  }

  if (!videoUrl) {
    await withSceneError(userId, projectId, sceneId, new Error('Sync webhook payload did not contain a video URL.'));
    return;
  }

  try {
    const storagePath = await downloadAndStoreSyncVideo(userId, projectId, sceneId, videoUrl);
    await doc.ref.update({
      finalVideoUrl: storagePath,
      status: 'lipsync_ready',
      syncWebhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: admin.firestore.FieldValue.delete(),
    });

    const duration = ((doc.data() as Record<string, unknown>).durationSeconds as number) ?? 0;
    await logUsage(userId, projectId, {
      service: 'synclabs',
      operation: 'generateSceneLipsync',
      sceneId,
      units: { durationSeconds: duration },
      estimatedCostUsd: estimateSyncCost('lipsync-2', duration),
    });
  } catch (err) {
    await withSceneError(userId, projectId, sceneId, err);
  }
}

async function processSyncWebhookPayload(parsed: Record<string, any>): Promise<void> {
  const syncGenerationId = parsed.id as string | undefined;
  if (!syncGenerationId) return;

  const status = (parsed.status as string | undefined) ?? '';
  const outputUrl =
    (parsed.outputUrl as string | undefined) ??
    (parsed.videoUrl as string | undefined) ??
    (parsed.result?.outputUrl as string | undefined);
  const isCompleted = status.toLowerCase() === 'completed' || status.toLowerCase() === 'success';
  const error = isCompleted ? undefined : ((parsed.error as string) ?? `Sync reported status: ${status}`);
  await finalizeSyncVideo(syncGenerationId, error, isCompleted ? outputUrl : undefined);
}

const syncWebhookApp = express();
syncWebhookApp.use(express.raw({ type: 'application/json' }));
syncWebhookApp.post('/syncWebhook', async (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;
  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    res.status(400).send('Invalid JSON');
    return;
  }

  const syncGenerationId = parsed.id as string | undefined;
  let apiKey: string | undefined;
  if (syncGenerationId) {
    const snapshot = await db
      .collectionGroup('scenes')
      .where('syncGenerationId', '==', syncGenerationId)
      .where('status', '==', 'lipsync_generating')
      .limit(1)
      .get();
    if (!snapshot.empty) {
      const pathParts = snapshot.docs[0].ref.path.split('/');
      const userId = pathParts[1];
      try {
        apiKey = await getSecretValue(userId, 'synclabs');
      } catch (err) {
        console.error('Failed to load Sync key for webhook verification:', (err as Error).message);
      }
    }
  }

  const verified = apiKey ? await verifySyncWebhook(rawBody, req.headers['sync-signature'] as string | undefined, apiKey) : false;
  if (!verified) {
    res.status(400).send('Invalid signature');
    return;
  }
  res.status(200).send('OK');
  try {
    await processSyncWebhookPayload(parsed);
  } catch (err) {
    console.error('processSyncWebhookPayload failed:', (err as Error).message);
  }
});

export const syncWebhook = pipeline.https.onRequest(syncWebhookApp);

async function doGenerateSceneLipsync(userId: string, projectId: string, sceneId: string): Promise<void> {
  const [projectSnap, sceneSnap] = await Promise.all([
    projectPath(userId, projectId).get(),
    scenePath(userId, projectId, sceneId).get(),
  ]);
  if (!projectSnap.exists || !sceneSnap.exists) return;

  const scene = sceneSnap.data() as Record<string, unknown>;
  const videoUrl = (scene.videoUrl as string | undefined) ?? '';
  const audioUrl = (scene.audioUrl as string | undefined) ?? '';
  if (!videoUrl || !audioUrl) {
    throw new Error('Scene is missing video or audio.');
  }

  const apiKey = await getSecretValue(userId, 'synclabs');
  const [videoSignedUrl, audioSignedUrl] = await Promise.all([getSignedDownloadUrl(videoUrl), getSignedDownloadUrl(audioUrl)]);

  const res = await axios.post(
    `${SYNC_BASE_URL}/v2/generate`,
    {
      input: [
        { type: 'video', url: videoSignedUrl },
        { type: 'audio', url: audioSignedUrl },
      ],
      model: 'lipsync-2',
      webhook_url: SYNC_WEBHOOK_URL,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    }
  );

  const syncGenerationId = res.data?.id as string | undefined;
  if (!syncGenerationId) throw new Error('Sync Labs did not return a generation id.');

  await scenePath(userId, projectId, sceneId).update({
    status: 'lipsync_generating',
    syncGenerationId,
    syncRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastError: admin.firestore.FieldValue.delete(),
  });
}

export const generateSceneLipsync = pipeline.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const projectId = data?.projectId as string | undefined;
  const sceneId = data?.sceneId as string | undefined;
  if (!projectId || !sceneId) {
    throw new functions.https.HttpsError('invalid-argument', 'projectId and sceneId are required.');
  }
  try {
    await doGenerateSceneLipsync(userId, projectId, sceneId);
    return { success: true };
  } catch (err) {
    await withSceneError(userId, projectId, sceneId, err);
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});

async function doPollSyncLabs(): Promise<void> {
  const snapshot = await db.collectionGroup('scenes').where('status', '==', 'lipsync_generating').get();
  if (snapshot.empty) return;

  const now = Date.now();
  const maxAgeMs = SYNC_MAX_AGE_MINUTES * 60 * 1000;
  const reconcileAgeMs = SYNC_RECONCILE_AGE_MINUTES * 60 * 1000;
  const syncKeyByUser = new Map<string, string>();

  for (const doc of snapshot.docs) {
    const scene = doc.data() as Record<string, unknown>;
    const requestedAt = toMillis(scene.syncRequestedAt);

    if (!requestedAt) {
      await doc.ref.update({ status: 'failed', lastError: 'Missing syncRequestedAt.' });
      continue;
    }

    if (now - requestedAt > maxAgeMs) {
      await doc.ref.update({ status: 'failed', lastError: 'Lip-sync generation timed out.' });
      continue;
    }

    if (now - requestedAt < reconcileAgeMs) continue;

    const syncGenerationId = (scene.syncGenerationId as string | undefined) ?? '';
    if (!syncGenerationId) {
      await doc.ref.update({ status: 'failed', lastError: 'Missing syncGenerationId.' });
      continue;
    }

    const pathParts = doc.ref.path.split('/');
    const userId = pathParts[1];

    try {
      const statusRes = await axios.get(`${SYNC_BASE_URL}/v2/generate/${syncGenerationId}`, {
        headers: { Authorization: `Bearer ${syncKeyByUser.get(userId) ?? (await getSecretValue(userId, 'synclabs'))}` },
        timeout: 15000,
      });
      if (!syncKeyByUser.has(userId)) {
        syncKeyByUser.set(userId, statusRes.config?.headers?.Authorization as string ?? '');
      }

      const data = statusRes.data as Record<string, any>;
      const status = (data.status as string | undefined) ?? '';
      const outputUrl =
        (data.outputUrl as string | undefined) ??
        (data.videoUrl as string | undefined) ??
        (data.result?.outputUrl as string | undefined);
      const isCompleted = status.toLowerCase() === 'completed' || status.toLowerCase() === 'success';

      if (status.toLowerCase() === 'failed' || status.toLowerCase() === 'error') {
        await finalizeSyncVideo(syncGenerationId, (data.error as string) ?? 'Sync Labs reported failure.', undefined);
        continue;
      }

      if (!isCompleted || !outputUrl) continue;

      await finalizeSyncVideo(syncGenerationId, undefined, outputUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync Labs polling error.';
      await doc.ref.update({ status: 'failed', lastError: message });
    }
  }
}

export const pollSyncLabs = pipeline.pubsub
  .schedule('every 2 minutes')
  .timeZone('America/Los_Angeles')
  .onRun(async (_context) => {
    await doPollSyncLabs();
  });

async function doPollFalQueue(): Promise<void> {
  const snapshot = await db.collectionGroup('scenes').where('status', '==', 'video_generating').get();
  if (snapshot.empty) return;

  const now = Date.now();
  const maxAgeMs = FAL_MAX_AGE_MINUTES * 60 * 1000;
  const reconcileAgeMs = FAL_RECONCILE_AGE_MINUTES * 60 * 1000;
  const falKeyByUser = new Map<string, string>();

  for (const doc of snapshot.docs) {
    const scene = doc.data() as Record<string, unknown>;
    const requestedAt = toMillis(scene.falRequestedAt);

    if (!requestedAt) {
      await doc.ref.update({ status: 'failed', lastError: 'Missing falRequestedAt.' });
      continue;
    }

    if (now - requestedAt > maxAgeMs) {
      await doc.ref.update({
        status: 'failed',
        lastError: 'Video generation timed out.',
      });
      continue;
    }

    // Skip very recent jobs; the webhook is the primary path.
    if (now - requestedAt < reconcileAgeMs) continue;

    const requestId = (scene.falRequestId as string | undefined) ?? '';
    const endpoint = (scene.falEndpoint as string | undefined) ?? '';
    if (!requestId || !endpoint) {
      await doc.ref.update({ status: 'failed', lastError: 'Missing falRequestId or falEndpoint.' });
      continue;
    }

    const pathParts = doc.ref.path.split('/');
    const userId = pathParts[1];

    try {
      const statusRes = await axios.get(`https://queue.fal.run/${endpoint}/requests/${requestId}/status`, {
        headers: { Authorization: `Key ${falKeyByUser.get(userId) ?? (await getSecretValue(userId, 'falai'))}` },
        timeout: 15000,
      });
      if (!falKeyByUser.has(userId)) {
        falKeyByUser.set(userId, statusRes.config?.headers?.Authorization as string ?? '');
      }

      const queueStatus = statusRes.data?.status as string | undefined;
      if (queueStatus === 'FAILED') {
        await finalizeFalVideo(requestId, (statusRes.data?.error as string) ?? 'Fal queue reported failure.', undefined);
        continue;
      }

      if (queueStatus !== 'COMPLETED') continue;

      const resultRes = await axios.get(`https://queue.fal.run/${endpoint}/requests/${requestId}`, {
        headers: { Authorization: `Key ${falKeyByUser.get(userId) ?? ''}` },
        timeout: 15000,
      });

      const output = resultRes.data?.data ?? resultRes.data;
      const videoUrl = output?.video?.url as string | undefined;
      if (!videoUrl) {
        await finalizeFalVideo(requestId, 'Fal result did not contain a video URL.', undefined);
        continue;
      }

      await finalizeFalVideo(requestId, undefined, videoUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fal polling error.';
      await doc.ref.update({ status: 'failed', lastError: message });
    }
  }
}

export const pollFalQueue = pipeline.pubsub
  .schedule('every 2 minutes')
  .timeZone('America/Los_Angeles')
  .onRun(async (_context) => {
    await doPollFalQueue();
  });
