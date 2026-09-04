const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'reelforge-4b07d';
const SA_NAME = 'reelforge-secrets-manager';
const SA_EMAIL = `${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`;

function getToken() {
  const configPath = path.join(process.env.USERPROFILE || process.env.HOME, '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config.tokens?.access_token;
}

function apiRequest(hostname, fullPath, method, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: fullPath, method, headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // 1. Create dedicated service account if it doesn't exist.
  try {
    await apiRequest(
      'iam.googleapis.com',
      `/v1/projects/${PROJECT_ID}/serviceAccounts`,
      'POST',
      {
        accountId: SA_NAME,
        serviceAccount: { displayName: 'Reelforge Secrets Manager', description: 'Minimum-privilege SA for saveApiKey/deleteApiKey' },
      }
    );
    console.log(`Created service account: ${SA_EMAIL}`);
  } catch (err) {
    if (err.body?.error?.status === 'ALREADY_EXISTS') {
      console.log(`Service account already exists: ${SA_EMAIL}`);
    } else {
      throw err;
    }
  }

  // 2. Get current IAM policy.
  let policy = await apiRequest('cloudresourcemanager.googleapis.com', `/v1/projects/${PROJECT_ID}:getIamPolicy`, 'POST', {});
  const member = `serviceAccount:${SA_EMAIL}`;
  const defaultSa = `${PROJECT_ID}@appspot.gserviceaccount.com`;
  const defaultMember = `serviceAccount:${defaultSa}`;

  // 3. Add Secret Manager + Firestore bindings to the new SA and remove from the default SA.
  const roles = ['roles/secretmanager.admin', 'roles/datastore.user'];
  for (const role of roles) {
    const binding = policy.bindings.find((b) => b.role === role);
    if (binding) {
      if (!binding.members.includes(member)) binding.members.push(member);
    } else {
      policy.bindings.push({ role, members: [member] });
    }
  }

  // Remove the broad Secret Manager binding from the default App Engine SA.
  const adminBinding = policy.bindings.find((b) => b.role === 'roles/secretmanager.admin');
  if (adminBinding) {
    adminBinding.members = adminBinding.members.filter((m) => m !== defaultMember);
  }

  await apiRequest('cloudresourcemanager.googleapis.com', `/v1/projects/${PROJECT_ID}:setIamPolicy`, 'POST', { policy });
  console.log(`Granted roles/secretmanager.admin and roles/datastore.user to ${SA_EMAIL}`);
  console.log(`Removed roles/secretmanager.admin from ${defaultSa} if present`);

  console.log('\nDone. Update functions/src/index.ts to use this SA and re-deploy.');
}

main().catch((err) => {
  console.error('Failed:', err.status ? JSON.stringify(err.body, null, 2) : err);
  process.exit(1);
});
