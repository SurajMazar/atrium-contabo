# cert-manager ClusterIssuers referenced by the base Ingress annotations.
# Apply once per cluster (not namespaced):  kubectl apply -f cluster-issuers.yaml
# DNS-01 is required for the *.{{sitesDomain}} wildcard; the example uses Cloudflare —
# swap the solver for route53/clouddns/azuredns as needed.
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-http01
spec:
  acme:
    email: {{acmeEmail}}
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef: { name: letsencrypt-http01-account }
    solvers:
      - http01: { ingress: { ingressClassName: nginx } }
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-dns01
spec:
  acme:
    email: {{acmeEmail}}
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef: { name: letsencrypt-dns01-account }
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef: { name: cloudflare-api-token, key: api-token }
        selector:
          dnsZones: ["{{domain}}"]
