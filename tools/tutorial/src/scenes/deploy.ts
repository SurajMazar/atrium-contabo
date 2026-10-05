import { asset, type Scene } from '../director';
import { card, terminal } from './helpers';

const gen = (t: string) => `pnpm -s atrium setup production --target ${t} --domain atrium.example.com --out deploy/${t} --force -y`;

export const cliScenes: Scene[] = [
  card('90-cli-card', 'Command line', 'Chapter 10', 'The *atrium* command line', 'Inspired by Frappe bench: one tool to set up, run, maintain and deploy', [
    'Everything you saw can also be managed from the terminal with the atrium command, modelled on Frappe bench.',
  ]),
  terminal('91-cli', 'Command line', 'Everyday commands', [
    { cmd: 'pnpm atrium config list', run: 'pnpm -s atrium config list', say: 'atrium config reads and writes the dot env file safely, and masks every secret when listing.', maxLines: 24, lineMs: 14 },
    { cmd: 'pnpm atrium backup --help', run: 'pnpm -s atrium backup --help', say: 'Backups dump the database and, optionally, the object storage into a dated archive with a checksummed manifest, and atrium restore brings them back.', maxLines: 18, lineMs: 14 },
    { cmd: 'pnpm atrium new-component --help', run: 'pnpm -s atrium new-component --help', say: 'Scaffold commands create new components, providers and plugins that follow the registry conventions, ready to show up in the builder, the AI agent and the renderer at once.', maxLines: 18, lineMs: 14 },
  ]),
];

export const deployScenes: Scene[] = [
  card('a0-deploy-card', 'Deploy to production', 'Chapter 11', 'Deploy to *production*', 'Podman or Docker · Kubernetes · cPanel · AWS · Azure · Google Cloud · Vercel', [
    'Finally, production. Atrium is four apps and three data services, and it runs almost anywhere.',
  ]),
  {
    id: 'a1-topology', chapter: 'Deploy to production', title: 'Topology', storage: 'none',
    setup: async (d) => d.goto(asset('diagram.html'), 'h1'),
    steps: [
      { say: 'A typical production setup puts the admin and the public renderer on an edge platform such as Vercel, runs the API and background workers as containers, and uses managed PostgreSQL, Redis and object storage.', holdMs: 400 },
      { say: 'Do not force the workers onto serverless functions: queues, image processing and AI generation are long running. The setup command generates the right artifacts for each target.', holdMs: 600 },
    ],
  },
  terminal('a2-deploy-podman', 'Deploy to production', 'Single server with Podman', [
    { cmd: 'pnpm atrium setup production --target podman --domain atrium.example.com', run: gen('podman'), say: 'For a single virtual server, target podman. You get a production compose file, Quadlet units for systemd, a Caddy reverse proxy with automatic HTTPS, on demand certificates for customer domains, and a dot env file with fresh secrets.', maxLines: 36, lineMs: 12 },
    { cmd: 'find deploy/podman -type f | sort', say: 'Copy the folder to your server, run the migration, and start the stack. The full walkthrough is in docs, deployment, V P S podman.', maxLines: 20 },
  ]),
  terminal('a3-deploy-k8s', 'Deploy to production', 'Kubernetes', [
    { cmd: 'pnpm atrium setup production --target k8s --domain atrium.example.com', run: gen('k8s'), say: 'For Kubernetes, you get a Kustomize overlay on top of the base manifests: deployments with probes and resource limits, autoscaling, disruption budgets, network policies, an ingress with cert manager, a migration job and a backup cron job.', maxLines: 34, lineMs: 12 },
    { cmd: 'find deploy/k8s -type f | sort', say: 'Apply it with kubectl apply minus k, after creating the secrets. Wildcard DNS for customer subdomains points at the ingress.', maxLines: 20 },
  ]),
  terminal('a4-deploy-cpanel', 'Deploy to production', 'cPanel', [
    { cmd: 'pnpm atrium setup production --target cpanel --domain atrium.example.com', run: gen('cpanel'), say: 'cPanel shared hosting cannot run Redis or long running workers, so the guide is honest about it: host the public sites on cPanel, as static exports or through the Node app feature, and run the API and workers on a small VPS or container platform.', maxLines: 34, lineMs: 12 },
    { cmd: 'find deploy/cpanel -type f | sort', say: 'You get the dot h t access rewrites, a Passenger startup file and a step by step checklist. PostgreSQL is required; MySQL is not supported.', maxLines: 16 },
  ]),
  terminal('a5-deploy-cloud', 'Deploy to production', 'AWS, Azure and Vercel', [
    { cmd: 'pnpm atrium setup production --target aws --domain atrium.example.com', run: gen('aws'), say: 'On AWS, run the containers on ECS Fargate behind an application load balancer, with RDS for PostgreSQL, ElastiCache for Redis, S3 and CloudFront for media, Secrets Manager, and SES for email.', maxLines: 26, lineMs: 10 },
    { cmd: 'pnpm atrium setup production --target azure --domain atrium.example.com', run: gen('azure'), say: 'On Azure, use Container Apps with a migration job, PostgreSQL Flexible Server, Azure Cache for Redis, Blob Storage through the Azure driver, Key Vault, and Front Door for certificates.', maxLines: 26, lineMs: 10 },
    { cmd: 'pnpm atrium setup production --target vercel --domain atrium.example.com', run: gen('vercel'), say: 'And for Vercel, deploy the admin and the renderer as two projects, with a wildcard domain for customer sites, while the API and worker run on a container platform.', maxLines: 26, lineMs: 10 },
  ]),
  terminal('a6-deploy-docs', 'Deploy to production', 'Guides', [
    { cmd: 'ls docs docs/deployment', say: 'Every target has a full guide in the docs folder: local podman, a podman VPS, cPanel, AWS, Azure, Google Cloud, Kubernetes, DigitalOcean, Fly, Railway and Render, Cloudflare, and Vercel, plus architecture, security, database, storage, forms and AI agent documentation.', maxLines: 30 },
    { cmd: 'pnpm atrium setup check --env-file deploy/aws/.env', run: 'pnpm -s atrium setup check --env-file deploy/aws/.env', say: 'Before going live, atrium setup check validates a production environment file: strong secrets, secure cookies, trusted proxies, storage and mail settings.', maxLines: 24, lineMs: 14 },
  ]),
  card('b0-outro', 'Wrap up', 'That is Atrium', 'Build *hundreds* of websites on one platform', 'Schema-driven · AI-native · provider-independent · yours to deploy', [
    'That is the complete tour: developer setup, AI generation, the visual builder, content, forms and workflows, integrations, publishing, teams, the public website, the command line, and production deployment.',
    'Because everything is a validated schema rendered by one engine, every website you build, by hand or with AI, stays editable, portable and fast. Thanks for watching.',
  ]),
];
