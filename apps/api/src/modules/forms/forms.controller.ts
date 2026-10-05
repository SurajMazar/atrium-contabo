import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Access, CurrentUser, type AuthUser } from '../../common/decorators';
import { limitOf } from '../../common/http';
import { ZodBody } from '../../common/zod.pipe';
import { FormsService } from './forms.service';

const SubmissionPatch = z.object({ status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'REJECTED', 'SPAM', 'ARCHIVED']).optional(), read: z.boolean().optional(), tags: z.array(z.string().max(40)).max(30).optional(), assignedToId: z.string().nullable().optional() });

@Controller()
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Access('form.read', 'website', 'id') @Get('websites/:id/forms')
  list(@Param('id') id: string) { return this.forms.list(id); }

  @Access('form.create', 'website', 'id') @Post('websites/:id/forms')
  create(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.forms.create(id, body, user); }

  @Access('form.read', 'form', 'formId') @Get('forms/:formId')
  get(@Param('formId') formId: string) { return this.forms.get(formId); }

  @Access('form.update', 'form', 'formId') @Put('forms/:formId')
  save(@Param('formId') formId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.forms.save(formId, body, user); }

  @Access('form.delete', 'form', 'formId') @HttpCode(204) @Delete('forms/:formId')
  remove(@Param('formId') formId: string, @CurrentUser() user: AuthUser) { return this.forms.archive(formId, user); }

  @Access('submission.read', 'website', 'id') @Get('websites/:id/submissions')
  submissions(@Param('id') id: string, @Query() q: Record<string, string>) { return this.forms.submissions(id, { ...q, limit: limitOf(q.limit) }); }

  @Access('submission.export', 'website', 'id') @Get('websites/:id/submissions/export')
  async export(@Param('id') id: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const out = await this.forms.export(id, { format: q.format === 'xlsx' ? 'xlsx' : 'csv', formId: q.formId, status: q.status });
    res.setHeader('Content-Type', out.contentType).setHeader('Content-Disposition', `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.${out.ext}"`).send(out.buffer);
  }

  @Access('submission.update', 'website', 'id') @HttpCode(200) @Post('websites/:id/submissions/bulk')
  bulk(@Param('id') id: string, @Body(new ZodBody(z.object({ ids: z.array(z.string()).min(1).max(1000), action: z.enum(['markRead', 'markUnread', 'archive', 'status', 'tag', 'delete']), value: z.unknown().optional() }))) body: { ids: string[]; action: string; value?: unknown }) { return this.forms.bulk(id, body); }

  @Access('submission.read', 'submission', 'sid') @Get('submissions/:sid')
  submission(@Param('sid') sid: string) { return this.forms.submission(sid); }

  @Access('submission.update', 'submission', 'sid') @Patch('submissions/:sid')
  update(@Param('sid') sid: string, @Body(new ZodBody(SubmissionPatch)) body: z.infer<typeof SubmissionPatch>, @CurrentUser() user: AuthUser) { return this.forms.updateSubmission(sid, body, user); }

  @Access('submission.update', 'submission', 'sid') @Post('submissions/:sid/notes')
  note(@Param('sid') sid: string, @Body(new ZodBody(z.object({ body: z.string().trim().min(1).max(5000) }))) body: { body: string }, @CurrentUser() user: AuthUser) { return this.forms.addNote(sid, body.body, user); }

  @Access('submission.delete', 'submission', 'sid') @HttpCode(204) @Delete('submissions/:sid')
  removeSubmission(@Param('sid') sid: string) { return this.forms.deleteSubmission(sid); }
}
