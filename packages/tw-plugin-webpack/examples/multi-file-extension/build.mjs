// Tiny programmatic build runner so the example works without installing a
// separate CLI. With `@rspack/cli` (or webpack-cli) you'd instead just run:
//   rspack build -c rspack.config.js
import { rspack } from '@rspack/core';
import config from './rspack.config.js';

rspack(config, (err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(stats.toString({ colors: true, modules: false }));
  if (stats.hasErrors()) process.exit(1);
});
