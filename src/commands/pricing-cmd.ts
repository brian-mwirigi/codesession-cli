/**
 * Pricing management commands: pricing list/set/reset
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadPricing, setPricing, resetPricing, getPricingPath } from '../db';
import { jsonWrap } from './helpers';

export function register(program: Command): void {
  const pricingCmd = program
    .command('pricing')
    .description('Manage the model pricing table used for cost auto-calculation');

  pricingCmd
    .command('list')
    .description('Show all known model prices')
    .option('--json', 'Output JSON')
    .action((options) => {
      const pricing = loadPricing();
      if (options.json) {
        console.log(JSON.stringify(jsonWrap({ models: pricing })));
      } else {
        console.log(chalk.bold('\nModel Pricing (per 1M tokens)\n'));
        const sorted = Object.entries(pricing).sort(([a], [b]) => a.localeCompare(b));
        for (const [model, p] of sorted) {
          console.log(`  ${chalk.cyan(model.padEnd(24))} input: $${p.input.toFixed(2).padStart(6)}   output: $${p.output.toFixed(2).padStart(6)}`);
        }
        console.log(chalk.gray(`\n  Config: ${getPricingPath()}\n`));
      }
    });

  pricingCmd
    .command('set <model> <input> <output>')
    .description('Set pricing for a model (per 1M tokens)')
    .option('--provider <provider>', 'Provider name (stored as provider/model key)')
    .action((model: string, input: string, output: string, opts: any) => {
      const inp = parseFloat(input);
      const out = parseFloat(output);
      if (isNaN(inp) || isNaN(out)) {
        console.log(chalk.red('\nInput and output must be numbers (dollars per 1M tokens)\n'));
        return;
      }
      const key = opts.provider ? `${opts.provider}/${model}` : model;
      setPricing(key, inp, out);
      console.log(chalk.green(`\n${key}: input=$${inp}/1M, output=$${out}/1M`));
      console.log(chalk.gray(`  Saved to ${getPricingPath()}\n`));
    });

  pricingCmd
    .command('reset')
    .description('Remove all custom pricing overrides (revert to defaults)')
    .action(() => {
      resetPricing();
      console.log(chalk.green('\nPricing reset to defaults\n'));
    });
}
