'use client';

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@atrium/ui';
import { KeyRound, LifeBuoy, LogOut, Monitor, Palette, ShieldCheck, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useBranding } from '@/lib/branding';
import { useSession } from '@/lib/session';
import { useTheme, type ThemePreference } from '@/lib/theme';

export function UserMenu() {
  const { user, signOut } = useSession();
  const { theme, setTheme } = useTheme();
  const { branding } = useBranding();
  const router = useRouter();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-surface-3/60 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-3/60"
        >
          <Avatar src={user.avatarUrl} name={user.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-fg">{user.name}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate normal-case tracking-normal text-fg-muted">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuItem icon={<User />} onSelect={() => router.push('/account')}>
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Monitor />} onSelect={() => router.push('/account#sessions')}>
          Sessions
        </DropdownMenuItem>
        <DropdownMenuItem icon={<KeyRound />} onSelect={() => router.push('/account#security')}>
          Two-factor authentication
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={<Palette />}>Theme</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {branding.supportUrl && (
          <DropdownMenuItem icon={<LifeBuoy />} onSelect={() => window.open(branding.supportUrl, '_blank', 'noopener,noreferrer')}>
            Help &amp; support
          </DropdownMenuItem>
        )}
        {user.isSuperAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<ShieldCheck />} onSelect={() => router.push('/admin')}>
              Super admin
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<LogOut />}
          onSelect={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
