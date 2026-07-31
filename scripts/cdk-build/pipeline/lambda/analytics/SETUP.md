# Analytics Pipeline Setup

## OP3 API Token (Required for parallel comparison)

Store your OP3 API token in SSM Parameter Store:

```bash
aws ssm put-parameter \
  --name "/podcast/op3-api-token" \
  --value "YOUR_OP3_API_TOKEN" \
  --type SecureString \
  --profile podcast \
  --region eu-central-1
```

Get a free token at https://op3.dev (create account → API Keys).

## GeoLite2 Database (Required for country breakdown)

```bash
export MAXMIND_LICENSE_KEY="your-key"
./download-geolite2.sh
```

Sign up at https://www.maxmind.com/en/geolite2/signup

## Deploy

```bash
cd scripts/cdk-build/pipeline
npx cdk deploy --profile podcast
```
