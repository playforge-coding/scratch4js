// Tiny programmatic build runner so the example works without installing a
// separate CLI. With `rollup` (or `rolldown`) on your PATH you'd instead just run:
//   rollup -c rollup.config.mjs
import { rollup } from 'rollup';
import config from './rollup.config.mjs';

const bundle = await rollup(config);
await bundle.write(config.output);
await bundle.close();
console.log('Built', config.output.file);
