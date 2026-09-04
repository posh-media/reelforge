import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import axios from 'axios';
import { parseBuffer } from 'music-metadata';

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

  if (dialogue && dialogue.length > 0) {
    const buffers: Buffer[] = [];
    for (const line of dialogue) {
      const voiceId = characterVoice(line.speaker);
      const lineAudio = await callElevenLabsTTS(apiKey, voiceId, line.line);
      buffers.push(lineAudio);
    }
    audioBuffer = Buffer.concat(buffers);
  } else {
    const characterName = ((scene.characterNames as string[]) ?? [])[0] ?? characters[0].name;
    const voiceId = characterVoice(characterName);
    audioBuffer = await callElevenLabsTTS(apiKey, voiceId, sceneScript);
  }

  const storagePath = `users/${userId}/projects/${projectId}/scenes/${sceneId}/audio.mp3`;
  await storage
    .bucket()
    .file(storagePath)
    .save(audioBuffer, { contentType: 'audio/mpeg' });

  const duration = await getAudioDuration(audioBuffer);

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
  const body = {
    prompt,
    duration: clampedDuration.toString(),
    resolution: '720p',
    aspect_ratio: '16:9',
    generate_audio: false,
    seed: Math.floor(Math.random() * 1000000),
  };

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
  });

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

  try {
    if (!hasAudio || status === 'pending' || status === 'script_ready' || status === 'rejected') {
      await doGenerateSceneVoice(userId, projectId, sceneId);
    } else if (hasAudio && (!hasVideo || status === 'voice_ready' || status === 'failed')) {
      await doGenerateSceneVideo(userId, projectId, sceneId);
    } else {
      await doGenerateSceneVoice(userId, projectId, sceneId);
    }
    return { success: true };
  } catch (err) {
    await withSceneError(userId, projectId, sceneId, err);
    throw new functions.https.HttpsError('internal', (err as Error).message);
  }
});

async function doPollFalQueue(): Promise<void> {
  const snapshot = await db.collectionGroup('scenes').where('status', '==', 'video_generating').get();
  if (snapshot.empty) return;

  const falKeyByUser = new Map<string, string>();

  for (const doc of snapshot.docs) {
    const pathParts = doc.ref.path.split('/');
    const userId = pathParts[1];
    const projectId = pathParts[3];
    const sceneId = pathParts[5];
    const scene = doc.data() as Record<string, unknown>;

    const requestId = (scene.falRequestId as string | undefined) ?? '';
    const endpoint = (scene.falEndpoint as string | undefined) ?? '';
    if (!requestId || !endpoint) {
      await doc.ref.update({ status: 'failed', lastError: 'Missing falRequestId or falEndpoint.' });
      continue;
    }

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
        await doc.ref.update({
          status: 'failed',
          lastError: (statusRes.data?.error as string) ?? 'Fal queue reported failure.',
        });
        continue;
      }

      if (queueStatus !== 'COMPLETED') continue;

      const resultRes = await axios.get(`https://queue.fal.run/${endpoint}/requests/${requestId}`, {
        headers: { Authorization: `Key ${falKeyByUser.get(userId) ?? ''}` },
        timeout: 15000,
      });

      const output = resultRes.data?.data ?? resultRes.data;
      const videoUrl = output?.video?.url as string | undefined;
      if (!videoUrl) throw new Error('Fal result did not contain a video URL.');

      const videoRes = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
      });
      const videoBuffer = Buffer.from(videoRes.data as ArrayBuffer);

      const storagePath = `users/${userId}/projects/${projectId}/scenes/${sceneId}/video.mp4`;
      await storage.bucket().file(storagePath).save(videoBuffer, { contentType: 'video/mp4' });

      await doc.ref.update({
        videoUrl: storagePath,
        status: 'video_ready',
        lastError: admin.firestore.FieldValue.delete(),
      });
    } catch (err) {
      await doc.ref.update({
        status: 'failed',
        lastError: err instanceof Error ? err.message : 'Fal polling error.',
      });
    }
  }
}

export const pollFalQueue = pipeline.pubsub
  .schedule('every 1 minutes')
  .timeZone('America/Los_Angeles')
  .onRun(async (_context) => {
    await doPollFalQueue();
  });
