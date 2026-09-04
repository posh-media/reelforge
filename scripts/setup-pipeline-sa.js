const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'reelforge-4b07d';
const SA_NAME = 'reelforge-pipeline';
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
  // Create dedicated service account if it doesn't exist.
  try {
    await apiRequest(
      'iam.googleapis.com',
      `/v1/projects/${PROJECT_ID}/serviceAccounts`,
      'POST',
      {
        accountId: SA_NAME,
        serviceAccount: { displayName: 'Reelforge Pipeline', description: 'Least-privilege SA for generation and storage functions' },
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

  // Get current IAM policy and add the required roles.
  const policy = await apiRequest('cloudresourcemanager.googleapis.com', `/v1/projects/${PROJECT_ID}:getIamPolicy`, 'POST', {});
  const member = `serviceAccount:${SA_EMAIL}`;
  const roles = ['roles/secretmanager.secretAccessor', 'roles/datastore.user', 'roles/storage.objectAdmin'];

  for (const role of roles) {
    const binding = policy.bindings.find((b) => b.role === role);
    if (binding) {
      if (!binding.members.includes(member)) binding.members.push(member);
    } else {
      policy.bindings.push({ role, members: [member] });
    }
  }

  await apiRequest('cloudresourcemanager.googleapis.com', `/v1/projects/${PROJECT_ID}:setIamPolicy`, 'POST', { policy });
  console.log(`Granted ${roles.join(', ')} to ${SA_EMAIL}`);
  console.log('\nDone. Update functions/src/index.ts to use this SA for the new pipeline functions.');
}

main().catch((err) => {
  console.error('Failed:', err.status ? JSON.stringify(err.body, null, 2) : err);
  process.exit(1);
});
