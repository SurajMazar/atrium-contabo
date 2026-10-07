'use client';

import { Button, Skeleton, Stepper, type StepItem } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Eye, Globe, LayoutTemplate, PenTool, Rocket, Sparkles, Square } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CreateOrganizationDialog } from '@/components/shell/org-switcher';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

/**
 * Getting-started checklist. Each step reflects real state (org exists,
 * website exists, domain connected, published) and deep-links to the screen
 * that completes it.
 */
export function Onboarding() {
  const api = useApi();
  const { user, currentOrg, memberships } = useSession();
  const [orgOpen, setOrgOpen] = useState(false);
  const hasOrg = memberships.length > 0;

  const websites = useQuery({ queryKey: qk.websites(currentOrg?.id ?? ''), queryFn: () => api.websites.list(currentOrg!.id), enabled: !!currentOrg });
  const site = websites.data?.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const domains = useQuery({ queryKey: qk.domains(site?.id ?? ''), queryFn: () => api.domains.list(site!.id), enabled: !!site });
  const pages = useQuery({ queryKey: qk.pages(site?.id ?? ''), queryFn: () => api.pages.list(site!.id), enabled: !!site });

  const hasSite = !!site;
  const customized = !!pages.data?.some((p) => p.revision > 1) || !!site?.publishedAt;
  const hasDomain = (domains.data?.length ?? 0) > 0;
  const published = !!site?.publishedAt;

  const order = [true, hasOrg, hasSite, customized, customized, hasDomain, published];
  const firstOpen = order.findIndex((d) => !d);
  const status = (i: number): StepItem['status'] => (order[i] ? 'complete' : i === firstOpen ? 'current' : 'upcoming');

  const steps: StepItem[] = [
    { id: 'account', label: 'Create your account', description: user ? `Signed in as ${user.email}` : undefined, status: 'complete' },
    {
      id: 'org',
      // Only platform administrators create organizations; everyone else joins one by invitation.
      label: user?.isSuperAdmin || hasOrg ? 'Create an organization' : 'Join an organization',
      description: hasOrg
        ? currentOrg?.name
        : user?.isSuperAdmin
          ? 'Organizations hold websites, members, billing and integrations.'
          : 'You are not part of an organization yet. Ask your administrator to invite you, then open the link in the invitation email.',
      status: status(1),
      action: !hasOrg && user?.isSuperAdmin && (
        <Button size="sm" variant="primary" onClick={() => setOrgOpen(true)}>
          Create organization
        </Button>
      ),
    },
    {
      id: 'website',
      label: 'Create a website',
      description: hasSite ? site.name : 'Generate with AI, start from a template or begin blank.',
      status: status(2),
      action: hasOrg && !hasSite && (
        <div className="grid gap-2 sm:grid-cols-3">
          <ChoiceLink href="/w/new/ai" icon={<Sparkles />} title="AI generate" description="Describe your business" />
          <ChoiceLink href="/w/new?method=template" icon={<LayoutTemplate />} title="Template" description="Pick a blueprint" />
          <ChoiceLink href="/w/new?method=blank" icon={<Square />} title="Blank" description="Start from scratch" />
        </div>
      ),
    },
    {
      id: 'customize',
      label: 'Customize',
      description: 'Edit content, theme and sections in the visual editor.',
      status: status(3),
      action: hasSite && !customized && (
        <Button size="sm" leadingIcon={<PenTool />} asChild>
          <Link href={`/w/${site.id}/editor`}>Open editor</Link>
        </Button>
      ),
    },
    {
      id: 'preview',
      label: 'Preview',
      description: 'Share a private preview link before going live.',
      status: status(4),
      action: hasSite && !published && (
        <Button size="sm" variant="ghost" leadingIcon={<Eye />} asChild>
          <Link href={`/w/${site.id}/versions`}>Create a preview link</Link>
        </Button>
      ),
    },
    {
      id: 'domain',
      label: 'Connect a domain',
      description: hasDomain ? domains.data?.[0]?.hostname : 'Optional — your site also works on its platform address.',
      status: status(5),
      action: hasSite && !hasDomain && (
        <Button size="sm" variant="ghost" leadingIcon={<Globe />} asChild>
          <Link href={`/w/${site.id}/domains`}>Add domain</Link>
        </Button>
      ),
    },
    {
      id: 'publish',
      label: 'Publish',
      description: published ? 'Your website is live.' : 'Validate and publish the first version.',
      status: published ? 'complete' : status(6),
      action: hasSite && !published && (
        <Button size="sm" variant="primary" leadingIcon={<Rocket />} asChild>
          <Link href={`/w/${site.id}`}>Go to publish</Link>
        </Button>
      ),
    },
  ];

  // Organizations are created by platform administrators; everyone else joins one.
  if (!hasOrg && !user?.isSuperAdmin) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Welcome{user ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <div className="mt-8 rounded-lg border border-border bg-surface p-5">
          <p className="text-sm font-medium text-fg">You’re not part of an organization yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Ask your administrator to add you or send you an invitation{user ? ` for ${user.email}` : ''}. Invitations arrive by email — open the link while signed in with this address.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Welcome{user ? `, ${user.name.split(' ')[0]}` : ''}</h1>
      <p className="mt-1 text-sm text-fg-muted">A few steps to your first published website. Pick up any time from here.</p>
      <div className="mt-8 rounded-lg border border-border bg-surface p-5">
        {hasOrg && websites.isPending ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-2/3" />
            ))}
          </div>
        ) : (
          <Stepper steps={steps} />
        )}
      </div>
      {hasSite && (
        <div className="mt-6 flex justify-end">
          <Button size="sm" variant="ghost" trailingIcon={<ArrowRight />} asChild>
            <Link href="/">Go to websites</Link>
          </Button>
        </div>
      )}
      <CreateOrganizationDialog open={orgOpen} onOpenChange={setOrgOpen} onCreated={() => undefined} />
    </div>
  );
}

function ChoiceLink({ href, icon, title, description }: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return (
    <Link href={href} className="group rounded-md border border-border bg-surface px-3 py-2.5 outline-none transition-colors hover:border-border-strong hover:bg-surface-2/50 focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex items-center gap-1.5 text-sm font-medium text-fg [&_svg]:size-3.5 [&_svg]:text-fg-muted [&_svg]:stroke-[1.5]">
        {icon}
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>
    </Link>
  );
}
