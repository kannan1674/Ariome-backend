const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

async function loadSecrets() {
  const secretId = process.env.AWS_SECRET_ID || "ariome/backend/prod";
  const region = process.env.AWS_REGION || "us-east-1";

  const client = new SecretsManagerClient({ region });

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );

  if (!response.SecretString) {
    throw new Error("SecretString is empty");
  }

  const secrets = JSON.parse(response.SecretString);

  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = String(value);
  }

  console.log("Secrets loaded from AWS Secrets Manager");
}

module.exports = loadSecrets;