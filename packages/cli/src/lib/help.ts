import pc from 'picocolors';

/** Format an "Examples:" block for `addHelpText('after', …)`. */
export function examples(list: Array<[cmd: string, desc?: string]>): string {
  const lines = list.map(([cmd, desc]) => `  ${pc.cyan(`$ ${cmd}`)}${desc ? `\n      ${pc.dim(desc)}` : ''}`);
  return `\n${pc.bold('Examples:')}\n${lines.join('\n')}\n`;
}
