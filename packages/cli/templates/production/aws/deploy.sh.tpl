#!/usr/bin/env bash
# Atrium on AWS (ECS Fargate) — first-time provisioning walkthrough with the AWS CLI v2.
# Read it, set the variables, and run it step by step (it is idempotent-ish, not a full IaC
# replacement; for repeatable environments port it to Terraform/CDK). Guide: {{doc}}
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
CLUSTER=atrium
VPC_ID="${VPC_ID:?export VPC_ID}"              # existing VPC with 2+ private and 2+ public subnets
PRIVATE_SUBNETS="${PRIVATE_SUBNETS:?export PRIVATE_SUBNETS=subnet-a,subnet-b}"
APP_SG="${APP_SG:?export APP_SG=sg-...}"       # tasks; allows 3000/3001/4000 from the ALB SG, all egress
BUCKET="${BUCKET:-atrium-media-$ACCOUNT}"

# Fill the REPLACE_ME placeholders in the generated JSON files.
sed -i.bak -e "s/REPLACE_ME_ACCOUNT/$ACCOUNT/g" -e "s/REPLACE_ME_REGION/$REGION/g" -e "s/atrium-media-REPLACE_ME/$BUCKET/g" ecs/*.json iam/*.json && rm -f ecs/*.bak iam/*.bak

# 1. Object storage (private bucket; serve media through CloudFront with OAC)
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" $( [ "$REGION" = us-east-1 ] || echo --create-bucket-configuration LocationConstraint="$REGION" ) || true
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# 2. IAM roles (execution role reads secrets + writes logs; task role gets S3 access only)
aws iam create-role --role-name atrium-ecs-execution --assume-role-policy-document file://iam/ecs-tasks-trust.json || true
aws iam attach-role-policy --role-name atrium-ecs-execution --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name atrium-ecs-execution --policy-name atrium-secrets-logs --policy-document file://iam/ecs-execution-extra-policy.json
aws iam create-role --role-name atrium-ecs-task --assume-role-policy-document file://iam/ecs-tasks-trust.json || true
aws iam put-role-policy --role-name atrium-ecs-task --policy-name atrium-s3-media --policy-document file://iam/s3-media-policy.json

# 3. Secrets Manager: one JSON secret with every key from .env that is secret
#    (edit .env first: DATABASE_URL → RDS endpoint with ?sslmode=require, REDIS_URL → rediss://ElastiCache).
python3 - <<'PY' > /tmp/atrium-secret.json
import json, re
keys = {"DATABASE_URL","REDIS_URL","JWT_ACCESS_SECRET","JWT_REFRESH_SECRET","ENCRYPTION_KEY","RENDERER_SECRET","ANALYTICS_SALT","S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY","SMTP_USER","SMTP_PASSWORD","ANTHROPIC_API_KEY","OPENAI_API_KEY","GEMINI_API_KEY","VERCEL_TOKEN"}
out = {}
for line in open(".env"):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
    if m and m.group(1) in keys: out[m.group(1)] = m.group(2).strip('"')
print(json.dumps(out))
PY
aws secretsmanager create-secret --name atrium/production --secret-string file:///tmp/atrium-secret.json \
  || aws secretsmanager put-secret-value --secret-id atrium/production --secret-string file:///tmp/atrium-secret.json
rm -f /tmp/atrium-secret.json

# 4. ECS cluster with a Service Connect namespace (so admin/renderer reach the API at http://api:4000)
aws ecs create-cluster --cluster-name "$CLUSTER" --service-connect-defaults namespace=atrium || true
for t in api worker renderer admin migrate; do aws ecs register-task-definition --cli-input-json "file://ecs/task-$t.json" >/dev/null; done

# 5. Run migrations as a one-off task (repeat on every release before updating services)
aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition atrium-migrate \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNETS],securityGroups=[$APP_SG],assignPublicIp=DISABLED}"

# 6. Services. Create an ALB + target groups (api:4000, admin:3000, renderer:3001) with host rules
#    {{apiHost}} → api, {{adminHost}} → admin, {{sitesDomain}} + *.{{sitesDomain}} + customer domains → renderer,
#    then pass --load-balancers targetGroupArn=...,containerName=<svc>,containerPort=<port> below.
for svc in api worker renderer admin; do
  aws ecs create-service --cluster "$CLUSTER" --service-name "atrium-$svc" --task-definition "atrium-$svc" \
    --desired-count 2 --launch-type FARGATE \
    --deployment-configuration "minimumHealthyPercent=100,maximumPercent=200,deploymentCircuitBreaker={enable=true,rollback=true}" \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNETS],securityGroups=[$APP_SG],assignPublicIp=DISABLED}" \
    --service-connect-configuration "enabled=true,namespace=atrium$( [ "$svc" = api ] && echo ',services=[{portName=api,clientAliases=[{port=4000,dnsName=api}]}]' )" \
    || echo "service atrium-$svc exists — use update-service --force-new-deployment"
done
echo "Next: ALB listeners + ACM certificates, CloudFront for media, Route 53 records — see {{doc}}"
