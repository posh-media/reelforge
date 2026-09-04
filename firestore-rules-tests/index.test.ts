import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'reelforge-test',
    firestore: {
      rules: readFileSync('./firestore.rules', 'utf8'),
    },
  });

  const userA = 'user-a';
  const userB = 'user-b';
  const projectId = 'project-1';
  const sceneId = 'scene-1';

  function authedDb(userId: string) {
    return testEnv.authenticatedContext(userId).firestore();
  }

  function unauthedDb() {
    return testEnv.unauthenticatedContext().firestore();
  }

  const tests: { name: string; run: () => Promise<void> }[] = [];
  function test(name: string, fn: () => Promise<void>) {
    tests.push({ name, run: fn });
  }

  test('owner can read and write own project', async () => {
    const db = authedDb(userA);
    const ref = doc(db, 'users', userA, 'projects', projectId);
    await assertSucceeds(setDoc(ref, { title: 'Test' }));
    await assertSucceeds(getDoc(ref));
  });

  test('owner can read and write own scenes', async () => {
    await testEnv.clearFirestore();
    const db = authedDb(userA);
    const ref = doc(db, 'users', userA, 'projects', projectId, 'scenes', sceneId);
    await assertSucceeds(setDoc(ref, { order: 1, script: 'Hello' }));
    await assertSucceeds(getDoc(ref));
  });

  test('user cannot read another users project', async () => {
    await testEnv.clearFirestore();
    const owner = authedDb(userA);
    const ref = doc(owner, 'users', userA, 'projects', projectId);
    await assertSucceeds(setDoc(ref, { title: 'Test' }));

    const other = authedDb(userB);
    const otherRef = doc(other, 'users', userA, 'projects', projectId);
    await assertFails(getDoc(otherRef));
  });

  test('unauthenticated user cannot read anything', async () => {
    await testEnv.clearFirestore();
    const db = unauthedDb();
    const ref = doc(db, 'users', userA, 'projects', projectId);
    await assertFails(getDoc(ref));
  });

  test('owner can read and write apiKeys without raw secret', async () => {
    await testEnv.clearFirestore();
    const db = authedDb(userA);
    const ref = doc(db, 'users', userA, 'apiKeys', 'falai');
    await assertSucceeds(
      setDoc(ref, {
        serviceName: 'fal.ai',
        secretRef: 'projects/test/secrets/test',
        connected: true,
      })
    );
    await assertSucceeds(getDoc(ref));
  });

  test('user cannot read another users apiKeys', async () => {
    await testEnv.clearFirestore();
    const owner = authedDb(userA);
    const ref = doc(owner, 'users', userA, 'apiKeys', 'falai');
    await assertSucceeds(setDoc(ref, { serviceName: 'fal.ai', connected: true }));

    const other = authedDb(userB);
    const otherRef = doc(other, 'users', userA, 'apiKeys', 'falai');
    await assertFails(getDoc(otherRef));
  });

  test('apiKeys document cannot contain a raw secret field', async () => {
    await testEnv.clearFirestore();
    const db = authedDb(userA);
    const ref = doc(db, 'users', userA, 'apiKeys', 'falai');
    await assertFails(
      setDoc(ref, {
        serviceName: 'fal.ai',
        secret: 'super-secret',
        connected: true,
      })
    );
  });

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.run();
      console.log(`✓ ${t.name}`);
      passed += 1;
    } catch (err) {
      console.error(`✗ ${t.name}`);
      console.error(err);
      failed += 1;
    }
  }

  await testEnv.cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
