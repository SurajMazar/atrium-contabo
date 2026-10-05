import { Controller, Get, Param } from '@nestjs/common';
import { listAnimationPresets } from '@atrium/animations';
import { registry } from '@atrium/component-registry';
import { THEME_PRESETS } from '@atrium/design-tokens';
import { notFound } from '../../common/errors';

/** The component registry is the single source of truth for builder, AI and renderer. */
@Controller('registry')
export class RegistryController {
  @Get('components')
  components() {
    return registry.list().map((d) => ({
      type: d.type, name: d.name, category: d.category, level: d.level, description: d.description, icon: d.icon, variants: d.variants, defaultVariant: d.defaultVariant,
      controls: d.controls, styleControls: registry.styleKeys(d.type), children: d.children ?? false, bindable: d.bindable, animations: d.animations, defaultProps: d.defaultProps, defaultChildren: d.defaultChildren, hidden: d.hidden ?? false,
    }));
  }

  @Get('components/:type/schema')
  schema(@Param('type') type: string) {
    const s = registry.jsonSchema(type);
    if (!s) throw notFound('Component');
    return s;
  }

  @Get('animations')
  animations() {
    return listAnimationPresets();
  }

  @Get('themes')
  themes() {
    return Object.entries(THEME_PRESETS).map(([key, tokens]) => ({ key, tokens }));
  }
}
