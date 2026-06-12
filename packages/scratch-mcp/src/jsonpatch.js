/**
 * A tiny, dependency-free implementation of JSON Pointer (RFC 6901) and JSON
 * Patch (RFC 6902) — just enough for the `patch_target` MCP tool to make
 * surgical edits to a target's raw JSON (its blocks, costumes, fields, …).
 *
 * Patches are applied atomically: every operation runs against a deep clone, so
 * if any op fails the caller's document is left untouched.
 *
 * @module jsonpatch
 */

/**
 * Parse a JSON Pointer into its reference tokens, undoing `~1`/`~0` escaping.
 *
 * @param {string} pointer - e.g. `/blocks/abc/fields/VARIABLE/0`. `""` is root.
 * @returns {string[]} The decoded tokens (empty array for the root pointer).
 */
export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (!pointer.startsWith('/'))
    throw new Error(`Invalid JSON Pointer "${pointer}" (must start with "/").`);
  return pointer
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * Resolve a JSON Pointer against a document.
 *
 * @param {*} doc - The document to read from.
 * @param {string} pointer - A JSON Pointer.
 * @returns {*} The referenced value.
 */
export function getPointer(doc, pointer) {
  let node = doc;
  for (const token of parsePointer(pointer)) {
    if (node == null || typeof node !== 'object')
      throw new Error(`JSON Pointer "${pointer}" does not resolve.`);
    const key = Array.isArray(node) ? Number(token) : token;
    if (!(key in node))
      throw new Error(`JSON Pointer "${pointer}" does not resolve.`);
    node = node[key];
  }
  return node;
}

/** Structural equality for JSON values, used by the `test` op. */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a == null || b == null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== 'object') return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => k in b && deepEqual(a[k], b[k]));
}

/**
 * Navigate to the parent container of a pointer's final token.
 *
 * @param {*} root - The (mutable) document root.
 * @param {string[]} tokens - Decoded pointer tokens (non-empty).
 * @returns {{ parent: object | unknown[], token: string }}
 */
function parentOf(root, tokens) {
  let parent = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (parent == null || typeof parent !== 'object')
      throw new Error(`Path /${tokens.join('/')} does not resolve.`);
    const key = Array.isArray(parent) ? Number(token) : token;
    if (!(key in parent))
      throw new Error(`Path /${tokens.join('/')} does not resolve.`);
    parent = parent[key];
  }
  return { parent, token: tokens[tokens.length - 1] };
}

/** Insert/replace `value` at the location addressed by `tokens`. */
function addAt(rootRef, tokens, value, replace) {
  if (tokens.length === 0) {
    rootRef.doc = value; // whole-document replacement
    return;
  }
  const { parent, token } = parentOf(rootRef.doc, tokens);
  if (Array.isArray(parent)) {
    if (token === '-') {
      parent.push(value);
      return;
    }
    const index = Number(token);
    if (!Number.isInteger(index) || index < 0 || index > parent.length)
      throw new Error(`Array index "${token}" out of range.`);
    if (replace) {
      if (index >= parent.length)
        throw new Error(`Cannot replace missing index "${token}".`);
      parent[index] = value;
    } else {
      parent.splice(index, 0, value);
    }
  } else if (parent && typeof parent === 'object') {
    if (replace && !(token in parent))
      throw new Error(`Cannot replace missing key "${token}".`);
    parent[token] = value;
  } else {
    throw new Error(`Cannot set "${token}" on a non-object.`);
  }
}

/** Remove the value addressed by `tokens`, returning it. */
function removeAt(rootRef, tokens) {
  if (tokens.length === 0) throw new Error('Cannot remove the whole document.');
  const { parent, token } = parentOf(rootRef.doc, tokens);
  if (Array.isArray(parent)) {
    const index = Number(token);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length)
      throw new Error(`Array index "${token}" out of range.`);
    return parent.splice(index, 1)[0];
  }
  if (parent && typeof parent === 'object') {
    if (!(token in parent)) throw new Error(`Missing key "${token}".`);
    const value = parent[token];
    delete parent[token];
    return value;
  }
  throw new Error(`Cannot remove "${token}" from a non-object.`);
}

/**
 * Apply an RFC 6902 JSON Patch to a document, atomically and without mutating
 * the input. Throws on the first failing op (leaving the original untouched).
 *
 * @param {*} doc - The document to patch.
 * @param {Array<object>} patch - The list of patch operations.
 * @returns {*} A new, patched document.
 */
export function applyPatch(doc, patch) {
  if (!Array.isArray(patch))
    throw new Error('A JSON Patch must be an array of operations.');
  const rootRef = { doc: structuredClone(doc) };

  patch.forEach((op, i) => {
    if (!op || typeof op !== 'object')
      throw new Error(`Operation ${i} is not an object.`);
    const where = `operation ${i} (${op.op ?? '?'})`;
    switch (op.op) {
      case 'add':
        addAt(rootRef, parsePointer(op.path), structuredClone(op.value), false);
        break;
      case 'replace':
        addAt(rootRef, parsePointer(op.path), structuredClone(op.value), true);
        break;
      case 'remove':
        removeAt(rootRef, parsePointer(op.path));
        break;
      case 'move': {
        const from = parsePointer(op.from);
        const toTokens = parsePointer(op.path);
        if (toTokens.join('/').startsWith(from.join('/') + '/'))
          throw new Error(`Cannot move ${op.from} into its own child.`);
        addAt(rootRef, toTokens, removeAt(rootRef, from), false);
        break;
      }
      case 'copy':
        addAt(
          rootRef,
          parsePointer(op.path),
          structuredClone(getPointer(rootRef.doc, op.from)),
          false,
        );
        break;
      case 'test':
        if (!deepEqual(getPointer(rootRef.doc, op.path), op.value))
          throw new Error(`Test failed at ${op.path}.`);
        break;
      default:
        throw new Error(`Unknown op in ${where}.`);
    }
  });

  return rootRef.doc;
}
