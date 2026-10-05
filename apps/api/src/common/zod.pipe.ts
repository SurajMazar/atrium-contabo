import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { validation } from './errors';

/** `@Body(new ZodBody(schema))` — validates and returns parsed (defaults applied) data. */
export class ZodBody<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.output<T> {
    const res = this.schema.safeParse(value ?? {});
    if (!res.success) throw validation('Invalid request', res.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    return res.data;
  }
}
