# Worker on GKE Autopilot. Create the secret first:
#   kubectl create secret generic atrium-secrets --from-env-file=.env
# (or reuse infra/k8s/base for the whole stack on GKE).
apiVersion: apps/v1
kind: Deployment
metadata:
  name: atrium-worker
spec:
  replicas: 2
  selector: { matchLabels: { app: atrium-worker } }
  template:
    metadata: { labels: { app: atrium-worker } }
    spec:
      terminationGracePeriodSeconds: 120
      securityContext: { runAsNonRoot: true, runAsUser: 1000, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: worker
          image: {{registry}}/atrium-worker:{{tag}}
          envFrom: [{ secretRef: { name: atrium-secrets } }]
          resources:
            requests: { cpu: 500m, memory: 1Gi }
            limits: { memory: 2Gi }
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: [ALL] } }
