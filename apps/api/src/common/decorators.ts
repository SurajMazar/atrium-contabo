import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@atrium/schema';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  sessionId: string;
}

export interface AccessContext {
  organizationId: string;
  websiteId?: string;
  permissions: Set<string>;
  /** Accessed via super-admin override (audited). */
  superAdminOverride?: boolean;
}

export type AppRequest = Request & { user?: AuthUser; access?: AccessContext; id?: string };

export const IS_PUBLIC = 'atrium:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const SUPER_ADMIN = 'atrium:super-admin';
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN, true);

export type ResourceKind =
  | 'organization' | 'website' | 'page' | 'pageVersion' | 'form' | 'submission' | 'collection' | 'collectionItem'
  | 'media' | 'mediaFolder' | 'globalSection' | 'domain' | 'deployment' | 'webhook' | 'webhookDelivery'
  | 'emailProvider' | 'smsProvider' | 'storageProvider' | 'integration' | 'aiGeneration' | 'template';

export interface AccessRule {
  permission?: Permission | Permission[];
  resource: ResourceKind;
  /** Route param carrying the resource id. */
  param: string;
}

export const ACCESS = 'atrium:access';
/**
 * Declare the permission a route needs and how to find the owning tenant.
 * The guard loads the resource from the database — ids from the client are
 * never trusted to imply tenancy.
 */
export const Access = (permission: Permission | Permission[] | undefined, resource: ResourceKind, param: string) =>
  SetMetadata(ACCESS, { permission, resource, param } satisfies AccessRule);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.user!;
});

export const CurrentAccess = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.access!;
});
