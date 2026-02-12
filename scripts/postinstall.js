#!/usr/bin/env node

// Only show for global installs (not when used as a dependency)
const isGlobal = process.env.npm_config_global === 'true' ||
  (process.env.npm_lifecycle_event === 'postinstall' && !process.env.INIT_CWD?.includes('node_modules'));

if (isGlobal) {
  console.log('\n  codesession-cli installed successfully.');
  console.log('  Run "cs start" to begin tracking a session.\n');
  console.log('  GitHub:  https://github.com/brian-mwirigi/codesession-cli');
  console.log('  If this tool is useful to you, a star helps others find it.\n');
}
