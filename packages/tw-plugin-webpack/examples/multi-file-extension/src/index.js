// The entry module. It imports from sibling files (which webpack/Rspack inline
// into one bundle) and `export default`s the extension class. The plugin wraps
// everything in the TurboWarp IIFE and registers this class for you — there is
// deliberately no `Scratch.extensions.register(...)` call here.

import { greet } from './blocks/greeting.js';
import { add } from './blocks/math.js';
// The plugin inlines this as a base64 `data:` URI string (via `inlineAssets`).
import iconURI from './icon.svg';

export default class MultiFileExample {
  getInfo() {
    return {
      id: 'multifileexample',
      name: 'Multi-File Example',
      menuIconURI: iconURI,
      blocks: [
        {
          opcode: 'hello',
          blockType: Scratch.BlockType.REPORTER,
          text: 'greet [WHO]',
          arguments: {
            WHO: { type: Scratch.ArgumentType.STRING, defaultValue: 'world' },
          },
        },
        {
          opcode: 'sum',
          blockType: Scratch.BlockType.REPORTER,
          text: 'add [A] and [B]',
          arguments: {
            A: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
            B: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
          },
        },
      ],
    };
  }

  hello(args) {
    return greet(args.WHO);
  }

  sum(args) {
    return add(Number(args.A), Number(args.B));
  }
}
