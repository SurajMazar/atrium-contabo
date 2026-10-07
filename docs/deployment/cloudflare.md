# Cloudflare

Cloudflare complements any of the other topologies; it does not run the API or worker (they need Node.js
APIs, long-lived Redis connections and sharp, which Workers do not provide).

| Use                                               | Cloudflare product                                         |
| ------------------------------------------------- | ---------------------------------------------------------- |
| Platform object storage                           | **R2** (S3-compatible, no egress fees)                     |
| Static site exports / independent deployments     | **Pages** (and the `cloudflare-pages` deployment provider) |
| DNS, proxy, WAF, rate limiting                    | DNS + proxy ("orange cloud")                               |
| Tenant custom domains with automatic certificates | **Cloudflare for SaaS** (custom hostnames)                 |
| Form spam protection                              | **Turnstile** (captcha provider `turnstile`)               |
| Exposing a server without opening ports           | **Tunnel** (`cloudflared`)                                 |

## R2 as platform storage

R2 has its own storage driver, `r2`. It derives the S3 endpoint from your account ID, always uses
region `auto` and path-style requests, and never sends ACL or encryption headers (R2 has no object
ACLs and encrypts everything at rest).

1. **Bucket**: R2 → _Create bucket_ → `atrium-media`. Note the jurisdiction if you pick EU or FedRAMP.
2. **Public access**: bucket → _Settings_ → _Custom Domains_ → connect `media.example.com` (recommended,
   cached by Cloudflare). The `r2.dev` URL also works, but it is rate-limited and meant for testing.
   R2's S3 endpoint is never publicly readable, so a public URL is required.
3. **API token**: R2 → _Manage API tokens_ → _Create API token_ → **Object Read & Write**, limited
   to that bucket. Copy the _Access Key ID_ and _Secret Access Key_ (shown once).
4. **Account ID**: R2 overview → _Account details_ (32 hexadecimal characters).

```dotenv
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=<32-character account id>
R2_BUCKET=atrium-media
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_PUBLIC_URL=https://media.example.com
R2_JURISDICTION=default        # eu or fedramp if the bucket was created there
```

The API and worker refuse to start if `STORAGE_DRIVER=r2` and one of these is missing. `atrium doctor`
checks that the bucket is reachable with these credentials, and `atrium setup production --storage r2`
writes the variables with placeholders to fill in.

**Organizations' own buckets**: in the admin, Integrations → Storage → _Cloudflare R2_ asks for the same
values (account ID, bucket, jurisdiction, access key, public URL, secret). A super admin can set it as
the platform storage under Platform providers → Storage instead of using the environment.

**Moving to R2 from another bucket**: copy the objects with the same keys (for example
`rclone copy old:atrium-media r2:atrium-media`), then switch the variables and restart the API and worker.
Media already embedded in published pages keeps its old URL until the page is published again, so keep
the old bucket readable until then.

**CORS**: uploads go through the API, so no bucket CORS rule is needed. Only add one (allowing `PUT`
from `https://admin.example.com` with `Content-Type`) if you build direct browser uploads with
presigned URLs.

Existing setups that use `STORAGE_DRIVER=s3` with `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
keep working; the `r2` driver is the simpler, validated way to do the same thing.

## Pages for static exports

A single website can be built as static files (renderer single-site mode, `ATRIUM_STATIC_EXPORT=1`; see
[cpanel.md](cpanel.md#option-a--static-export-of-a-site-any-cpanel-plan) for the build) and uploaded:

```bash
npx wrangler pages project create acme-site
npx wrangler pages deploy apps/renderer/out --project-name acme-site --branch main
```

For automated per-site deployments, organizations can connect a Cloudflare Pages integration in the
admin and set the website's deployment mode to independent. The provider
(`packages/providers/src/deployment/cloudflare-pages.ts`) uploads static files, so the worker must build
the static export: set `WORKER_ENABLE_LOCAL_BUILDS=1` on the worker (it runs `npm install` + `next build`
in a temp directory — give it CPU, memory and `/tmp` space). The API token needs **Cloudflare Pages: Edit**
on the account; see [VERCEL.md](../VERCEL.md) for the general deployment flow (the same pipeline drives all
deployment providers).

## DNS and proxy in front of Atrium

| Record                  | Type                      | Proxy                                    |
| ----------------------- | ------------------------- | ---------------------------------------- |
| `admin`, `api`, `media` | A/CNAME → origin          | proxied                                  |
| `sites`, `*.sites`      | A/CNAME → renderer origin | proxied (wildcard proxying is supported) |

- SSL/TLS mode **Full (strict)**: the origin must present a valid certificate (Caddy/Let's Encrypt or a
  Cloudflare Origin CA certificate).
- With the Caddy setup's on-demand TLS, HTTP-01 challenges must reach the origin — proxied records work
  in Full (strict) mode, but if issuance fails switch the record to DNS-only until the certificate exists,
  or use Origin CA certificates and skip on-demand TLS for proxied hosts.
- Cache rules: bypass cache for `api.example.com` and `admin.example.com`; for tenant sites respect origin
  cache headers (the renderer sets them; ISR revalidation happens at the origin). After publishing, edge
  caches hold pages until their TTL — keep HTML TTLs short or purge by host via the Cloudflare API.
- WAF: enable the managed ruleset; add rate-limiting rules for `POST /v1/auth/login` and
  `POST /v1/public/forms/*/submit` on top of the API's own throttling.
- Visitor IPs: set `TRUST_PROXY` to the number of proxy hops in front of the API (e.g. `2` for
  Cloudflare → nginx → API) or to your proxies' addresses (`loopback,uniquelocal` plus
  [Cloudflare's ranges](https://www.cloudflare.com/ips/)). Never `true`: it trusts the left-most
  `X-Forwarded-For` value, which any client can set, and would let anyone dodge rate limits.

## Cloudflare for SaaS (tenant custom domains)

The scalable way to give every tenant a custom domain with automatic certificates:

1. Zone `example.com` on Cloudflare; SSL/TLS → **Custom Hostnames** → set the fallback origin
   `sites.example.com` (proxied, pointing at the renderer).
2. When a customer adds `www.customer.com` in Atrium, create a custom hostname through the Cloudflare API
   (`POST /zones/:zone/custom_hostnames` with `ssl.method: http`), and ask the customer to CNAME
   `www.customer.com` → `sites.example.com`.
3. The renderer only serves hosts that match a `Domain` row of a website (or a platform subdomain), so
   a hostname that was never added in Atrium gets the not-found page. Run Atrium's DNS verification before
   creating the custom hostname so tenants can only claim domains they control.

This replaces per-domain certificates at the origin (Caddy on-demand TLS, cert-manager Ingresses).

## Turnstile for forms

Create a Turnstile widget for your site domains, then in the admin add a captcha integration with driver
`turnstile` (site key + secret key) and enable it on the form. Verification is server-side and fails
closed (a Cloudflare outage rejects submissions rather than letting spam through).

## Tunnel

Expose a home server or a VM without public ports:

```bash
cloudflared tunnel create atrium
cloudflared tunnel route dns atrium admin.example.com
cloudflared tunnel route dns atrium api.example.com
cloudflared tunnel route dns atrium '*.sites.example.com'
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: atrium
credentials-file: /home/you/.cloudflared/<id>.json
ingress:
  - { hostname: admin.example.com, service: http://localhost:3000 }
  - { hostname: api.example.com, service: http://localhost:4000 }
  - { hostname: "*.sites.example.com", service: http://localhost:3001 }
  - { hostname: sites.example.com, service: http://localhost:3001 }
  - service: http_status:404
EOF
cloudflared tunnel run atrium
```

TLS terminates at Cloudflare; the apps can listen on plain HTTP locally.

## Troubleshooting

| Symptom                                                | Fix                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| R2 uploads fail with `InvalidRequest`/signature errors | `S3_REGION=auto`, endpoint without the bucket name, path-style on                |
| Redirect loop                                          | SSL mode is Flexible; use Full (strict)                                          |
| Not-found page for a custom hostname                   | the hostname was not added to a website in Atrium, or the CNAME points elsewhere |
| Stale pages after publish                              | edge cache TTL; purge by host or shorten HTML caching                            |
| Pages deployments fail with "static files only"        | set `WORKER_ENABLE_LOCAL_BUILDS=1` on the worker or use Vercel                   |
