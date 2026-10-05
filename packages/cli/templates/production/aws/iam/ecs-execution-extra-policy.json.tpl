{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadAtriumSecrets",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:secret:atrium/production-*"
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:REPLACE_ME_REGION:REPLACE_ME_ACCOUNT:log-group:/atrium/*"
    }
  ]
}
