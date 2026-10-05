apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: atrium-platform
spec:
  tls:
    - hosts: [{{adminHost}}, {{apiHost}}]
      secretName: atrium-platform-tls
  rules:
    - host: {{adminHost}}
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: atrium-admin, port: { name: http } } } }
    - host: {{apiHost}}
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: atrium-api, port: { name: http } } } }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: atrium-sites
spec:
  tls:
    - hosts: [{{sitesDomain}}, "*.{{sitesDomain}}"]
      secretName: atrium-sites-wildcard-tls
  rules:
    - host: {{sitesDomain}}
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: atrium-renderer, port: { name: http } } } }
    - host: "*.{{sitesDomain}}"
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: atrium-renderer, port: { name: http } } } }
