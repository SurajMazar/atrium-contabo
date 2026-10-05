{
  "family": "atrium-worker",
  "networkMode": "awsvpc",
  "requiresCompatibilities": [
    "FARGATE"
  ],
  "cpu": "1024",
  "memory": "2048",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "executionRoleArn": "arn:aws:iam::REPLACE_ME_ACCOUNT:role/atrium-ecs-execution",
  "taskRoleArn": "arn:aws:iam::REPLACE_ME_ACCOUNT:role/atrium-ecs-task",
  "containerDefinitions": [
    {
      "name": "worker",
      "image": "{{registry}}/atrium-worker:{{tag}}",
      "essential": true,
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "ADMIN_URL",
          "value": "https://{{adminHost}}"
        },
        {
          "name": "API_URL",
          "value": "https://{{apiHost}}"
        },
        {
          "name": "RENDERER_URL",
          "value": "https://{{sitesDomain}}"
        },
        {
          "name": "PLATFORM_SITES_DOMAIN",
          "value": "{{sitesDomain}}"
        },
        {
          "name": "PREVIEW_URL",
          "value": "https://{{sitesDomain}}"
        },
        {
          "name": "CORS_ORIGINS",
          "value": "https://{{adminHost}}"
        },
        {
          "name": "COOKIE_DOMAIN",
          "value": "{{adminHost}}"
        },
        {
          "name": "STORAGE_DRIVER",
          "value": "s3"
        },
        {
          "name": "S3_REGION",
          "value": "REPLACE_ME_REGION"
        },
        {
          "name": "S3_BUCKET",
          "value": "atrium-media-REPLACE_ME"
        },
        {
          "name": "S3_PUBLIC_URL",
          "value": "https://{{mediaHost}}"
        },
        {
          "name": "S3_FORCE_PATH_STYLE",
          "value": "false"
        },
        {
          "name": "SMTP_HOST",
          "value": "email-smtp.REPLACE_ME_REGION.amazonaws.com"
        },
        {
          "name": "SMTP_PORT",
          "value": "587"
        },
        {
          "name": "SMTP_SECURE",
          "value": "false"
        },
        {
          "name": "MAIL_FROM",
          "value": "Atrium <no-reply@{{domain}}>"
        },
        {
          "name": "ATRIUM_API_INTERNAL_URL",
          "value": "http://api:4000"
        },
        {
          "name": "MALLOC_ARENA_MAX",
          "value": "2"
        },
        {
          "name": "COOKIE_SECURE",
          "value": "true"
        },
        {
          "name": "TRUST_PROXY",
          "value": "loopback,uniquelocal"
        },
        {
          "name": "OUTBOUND_ALLOW_PRIVATE",
          "value": "false"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:DATABASE_URL::"
        },
        {
          "name": "REDIS_URL",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:REDIS_URL::"
        },
        {
          "name": "JWT_ACCESS_SECRET",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:JWT_ACCESS_SECRET::"
        },
        {
          "name": "JWT_REFRESH_SECRET",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:JWT_REFRESH_SECRET::"
        },
        {
          "name": "ENCRYPTION_KEY",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:ENCRYPTION_KEY::"
        },
        {
          "name": "RENDERER_SECRET",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:RENDERER_SECRET::"
        },
        {
          "name": "ANALYTICS_SALT",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:ANALYTICS_SALT::"
        },
        {
          "name": "S3_ACCESS_KEY_ID",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:S3_ACCESS_KEY_ID::"
        },
        {
          "name": "S3_SECRET_ACCESS_KEY",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:S3_SECRET_ACCESS_KEY::"
        },
        {
          "name": "SMTP_USER",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:SMTP_USER::"
        },
        {
          "name": "SMTP_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:SMTP_PASSWORD::"
        },
        {
          "name": "ANTHROPIC_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:ANTHROPIC_API_KEY::"
        },
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:OPENAI_API_KEY::"
        },
        {
          "name": "GEMINI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:GEMINI_API_KEY::"
        },
        {
          "name": "VERCEL_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:VERCEL_TOKEN::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/atrium/worker",
          "awslogs-region": "REPLACE_ME_REGION",
          "awslogs-stream-prefix": "worker",
          "awslogs-create-group": "true"
        }
      },
      "linuxParameters": {
        "initProcessEnabled": true
      },
      "stopTimeout": 120
    }
  ]
}
