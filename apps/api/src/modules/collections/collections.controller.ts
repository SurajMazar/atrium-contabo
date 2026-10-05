import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Access } from '../../common/decorators';
import { limitOf } from '../../common/http';
import { ZodBody } from '../../common/zod.pipe';
import { CollectionsService } from './collections.service';

const Create = z.object({ slug: z.string().max(60).default(''), name: z.string().trim().min(1).max(80), singularName: z.string().max(80).optional(), description: z.string().max(500).optional(), fields: z.array(z.unknown()).default([]), titleField: z.string().optional(), routePrefix: z.string().max(60).optional() });
const Item = z.object({ slug: z.string().max(120).optional(), status: z.enum(['draft', 'published', 'archived']).optional(), data: z.record(z.string(), z.unknown()) });

@Controller()
export class CollectionsController {
  constructor(private readonly svc: CollectionsService) {}

  @Access('page.read', 'website', 'id') @Get('websites/:id/collections')
  list(@Param('id') id: string) { return this.svc.list(id); }

  @Access('collection.manage', 'website', 'id') @Post('websites/:id/collections')
  create(@Param('id') id: string, @Body(new ZodBody(Create)) b: z.infer<typeof Create>) { return this.svc.create(id, b); }

  @Access('page.read', 'collection', 'cid') @Get('collections/:cid')
  get(@Param('cid') cid: string) { return this.svc.get(cid); }

  @Access('collection.manage', 'collection', 'cid') @Patch('collections/:cid')
  update(@Param('cid') cid: string, @Body(new ZodBody(Create.partial().extend({ singularName: z.string().nullable().optional(), description: z.string().nullable().optional(), routePrefix: z.string().nullable().optional() }))) b: Record<string, never>) { return this.svc.update(cid, b); }

  @Access('collection.manage', 'collection', 'cid') @HttpCode(204) @Delete('collections/:cid')
  remove(@Param('cid') cid: string) { return this.svc.remove(cid); }

  @Access('page.read', 'collection', 'cid') @Get('collections/:cid/items')
  items(@Param('cid') cid: string, @Query() q: Record<string, string>) { return this.svc.items(cid, { search: q.search, status: q.status, cursor: q.cursor, limit: limitOf(q.limit) }); }

  @Access('collection.content', 'collection', 'cid') @Post('collections/:cid/items')
  createItem(@Param('cid') cid: string, @Body(new ZodBody(Item)) b: z.infer<typeof Item>) { return this.svc.createItem(cid, b); }

  @Access('collection.content', 'collection', 'cid') @HttpCode(204) @Post('collections/:cid/items/reorder')
  reorder(@Param('cid') cid: string, @Body(new ZodBody(z.object({ ids: z.array(z.string()).max(5000) }))) b: { ids: string[] }) { return this.svc.reorder(cid, b.ids); }

  @Access('page.read', 'collectionItem', 'itemId') @Get('collection-items/:itemId')
  getItem(@Param('itemId') itemId: string) { return this.svc.getItem(itemId); }

  @Access('collection.content', 'collectionItem', 'itemId') @Patch('collection-items/:itemId')
  updateItem(@Param('itemId') itemId: string, @Body(new ZodBody(Item.partial())) b: Partial<z.infer<typeof Item>>) { return this.svc.updateItem(itemId, b); }

  @Access('collection.content', 'collectionItem', 'itemId') @HttpCode(204) @Delete('collection-items/:itemId')
  removeItem(@Param('itemId') itemId: string) { return this.svc.removeItem(itemId); }
}
