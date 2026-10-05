'use client';

import type { Webhook } from '@atrium/sdk';
import { Banner, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, CopyField, Field } from '@atrium/ui';
import { TriangleAlert } from 'lucide-react';

/** Shows the signing secret returned once on webhook creation. */
export function SecretDialog({ webhook, onOpenChange }: { webhook: Webhook | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!webhook} onOpenChange={onOpenChange}>
      <DialogContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader title="Webhook created" description={webhook ? `Use this secret to verify requests sent to ${webhook.name}.` : undefined} />
        <DialogBody className="space-y-4">
          <Field label="Signing secret">
            <CopyField value={webhook?.secret ?? ''} label="Signing secret" />
          </Field>
          <Banner tone="warning" icon={<TriangleAlert />}>
            Copy it now and store it with your endpoint’s configuration. It won’t be shown again — to rotate it, delete the webhook and add a new one.
          </Banner>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" size="sm" onClick={() => onOpenChange(false)}>
            I’ve saved the secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
