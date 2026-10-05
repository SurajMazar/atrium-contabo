{
  "family": "atrium-admin",
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
      "name": "admin",
      "image": "{{registry}}/atrium-admin:{{tag}}",
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
          "name": "ATRIUM_API_INTERNAL_URL",
          "value": "http://api:4000"
        },
        {
          "name": "PORT",
          "value": "3000"
        },
        {
          "name": "HOSTNAME",
          "value": "0.0.0.0"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/atrium/admin",
          "awslogs-region": "REPLACE_ME_REGION",
          "awslogs-stream-prefix": "admin",
          "awslogs-create-group": "true"
        }
      },
      "linuxParameters": {
        "initProcessEnabled": true
      },
      "stopTimeout": 45,
      "portMappings": [
        {
          "name": "admin",
          "containerPort": 3000,
          "protocol": "tcp",
          "appProtocol": "http"
        }
      ],
      "healthCheck": {
        "command": [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"
        ],
        "interval": 15,
        "timeout": 5,
        "retries": 5,
        "startPeriod": 40
      }
    }
  ]
}
