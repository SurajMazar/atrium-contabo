{
  "family": "atrium-renderer",
  "networkMode": "awsvpc",
  "requiresCompatibilities": [
    "FARGATE"
  ],
  "cpu": "512",
  "memory": "1024",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "executionRoleArn": "arn:aws:iam::REPLACE_ME_ACCOUNT:role/atrium-ecs-execution",
  "taskRoleArn": "arn:aws:iam::REPLACE_ME_ACCOUNT:role/atrium-ecs-task",
  "containerDefinitions": [
    {
      "name": "renderer",
      "image": "{{registry}}/atrium-renderer:{{tag}}",
      "essential": true,
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
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
          "name": "ATRIUM_API_INTERNAL_URL",
          "value": "http://api:4000"
        },
        {
          "name": "PORT",
          "value": "3001"
        },
        {
          "name": "HOSTNAME",
          "value": "0.0.0.0"
        }
      ],
      "secrets": [
        {
          "name": "RENDERER_SECRET",
          "valueFrom": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production:RENDERER_SECRET::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/atrium/renderer",
          "awslogs-region": "REPLACE_ME_REGION",
          "awslogs-stream-prefix": "renderer",
          "awslogs-create-group": "true"
        }
      },
      "linuxParameters": {
        "initProcessEnabled": true
      },
      "stopTimeout": 45,
      "portMappings": [
        {
          "name": "renderer",
          "containerPort": 3001,
          "protocol": "tcp",
          "appProtocol": "http"
        }
      ],
      "healthCheck": {
        "command": [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3001/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"
        ],
        "interval": 15,
        "timeout": 5,
        "retries": 5,
        "startPeriod": 40
      }
    }
  ]
}
