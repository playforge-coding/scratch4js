// The whole UI — used for BOTH modes. Interactive runs request a list of
// prompts; non-interactive runs pass an empty prompt list with the answers
// pre-filled from CLI flags, so the same Ink component renders scaffolding and
// install progress either way. Written as JSX (built with Rsbuild/SWC).

import { useState, useEffect } from 'react';
import { Box, Text, render, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';

import { BUNDLERS, BUNDLER_IDS } from '../bundlers.js';
import { PACKAGE_MANAGERS, installCommand } from '../detect.js';
import {
  installDeps,
  isOccupied,
  targetDirFor,
  writeProject,
} from '../scaffold.js';
import { toExtensionId } from '../templates.js';

/**
 * @typedef {Object} Answers
 * @property {string} projectName
 * @property {string} bundler
 * @property {boolean} types
 * @property {'npm'|'pnpm'|'yarn'|'bun'} packageManager
 */

/** A tiny spinner so we don't pull in another dependency. */
function Spinner() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="cyan">{frames[i]}</Text>;
}

const Header = () => (
  <Text>
    <Text color="cyan" bold>
      create-tw-extension
    </Text>
    {'  '}
    <Text dimColor>scaffold a TurboWarp extension</Text>
  </Text>
);

/**
 * @param {{
 *   initial: Answers,
 *   prompts: string[],
 *   install: boolean,
 *   force: boolean,
 *   onDone: (r: { ok: boolean, error?: string }) => void,
 * }} props
 */
function App({ initial, prompts, install, force, onDone }) {
  const { exit } = useApp();
  const [answers, setAnswers] = useState(initial);
  const [step, setStep] = useState(0); // index into `prompts`
  const [phase, setPhase] = useState(prompts.length ? 'prompt' : 'scaffold');
  const [written, setWritten] = useState(/** @type {string[]} */ ([]));
  const [installed, setInstalled] = useState(
    /** @type {boolean|null} */ (null),
  );
  const [error, setError] = useState('');

  const field = prompts[step];

  // Update answers without leaving the current prompt (e.g. TextInput typing).
  const patch = (delta) => setAnswers((a) => ({ ...a, ...delta }));

  // Advance past the current prompt; when the queue empties, start scaffolding.
  const advance = (delta) => {
    patch(delta);
    if (step + 1 < prompts.length) setStep(step + 1);
    else setPhase('scaffold');
  };

  // Write files once we enter the scaffold phase.
  useEffect(() => {
    if (phase !== 'scaffold') return;
    const targetDir = targetDirFor(answers);
    if (isOccupied(targetDir) && !force) {
      setError(
        `${answers.projectName} already exists and is not empty. Pass --force to scaffold into it anyway.`,
      );
      setPhase('error');
      return;
    }
    try {
      setWritten(writeProject(answers, targetDir));
    } catch (err) {
      setError(err?.message || String(err));
      setPhase('error');
      return;
    }
    setPhase(install ? 'install' : 'done');
  }, [phase]);

  // Run the install once we enter the install phase.
  useEffect(() => {
    if (phase !== 'install') return;
    let active = true;
    installDeps(answers.packageManager, targetDirFor(answers)).then((ok) => {
      if (!active) return;
      setInstalled(ok);
      setPhase('done');
    });
    return () => {
      active = false;
    };
  }, [phase]);

  // Report the result and tear down Ink once we reach a terminal phase.
  useEffect(() => {
    if (phase === 'done') {
      onDone({ ok: true });
      exit();
    } else if (phase === 'error') {
      onDone({ ok: false, error });
      exit();
    }
  }, [phase]);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Header />
      <Box height={1} />
      {phase === 'prompt' ? (
        <Prompt
          field={field}
          answers={answers}
          advance={advance}
          patch={patch}
        />
      ) : (
        <Progress
          phase={phase}
          answers={answers}
          written={written}
          install={install}
          installed={installed}
          error={error}
        />
      )}
    </Box>
  );
}

/**
 * One prompt screen, chosen by `field`.
 *
 * @param {{
 *   field: string,
 *   answers: Answers,
 *   advance: (delta: Partial<Answers>) => void,
 *   patch: (delta: Partial<Answers>) => void,
 * }} props
 */
function Prompt({ field, answers, advance, patch }) {
  if (field === 'name') {
    return (
      <Box>
        <Text>
          <Text color="green">? </Text>Project name:{' '}
        </Text>
        <TextInput
          value={answers.projectName}
          onChange={(v) => patch({ projectName: v })}
          placeholder="my-tw-extension"
          onSubmit={(value) =>
            advance({ projectName: (value || 'my-tw-extension').trim() })
          }
        />
      </Box>
    );
  }

  if (field === 'bundler') {
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="green">? </Text>Which bundler?
        </Text>
        <SelectInput
          initialIndex={Math.max(0, BUNDLER_IDS.indexOf(answers.bundler))}
          items={BUNDLER_IDS.map((id) => ({
            key: id,
            label: `${BUNDLERS[id].label}  —  ${BUNDLERS[id].hint}`,
            value: id,
          }))}
          onSelect={(item) => advance({ bundler: item.value })}
        />
      </Box>
    );
  }

  if (field === 'types') {
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="green">? </Text>Install{' '}
          <Text bold>@turbowarp/types</Text> for editor autocomplete?
        </Text>
        <SelectInput
          initialIndex={answers.types ? 0 : 1}
          items={[
            { key: 'yes', label: 'Yes', value: true },
            { key: 'no', label: 'No', value: false },
          ]}
          onSelect={(item) => advance({ types: item.value })}
        />
      </Box>
    );
  }

  if (field === 'pm') {
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="green">? </Text>Package manager?{'  '}
          <Text dimColor>(detected {answers.packageManager})</Text>
        </Text>
        <SelectInput
          initialIndex={Math.max(
            0,
            PACKAGE_MANAGERS.indexOf(answers.packageManager),
          )}
          items={PACKAGE_MANAGERS.map((pm) => ({
            key: pm,
            label: pm,
            value: pm,
          }))}
          onSelect={(item) => advance({ packageManager: item.value })}
        />
      </Box>
    );
  }

  return null;
}

/**
 * The scaffolding / install / done / error screen.
 *
 * @param {{ phase: string, answers: Answers, written: string[],
 *   install: boolean, installed: boolean|null, error: string }} props
 */
function Progress({ phase, answers, written, install, installed, error }) {
  if (phase === 'error') {
    return <Text color="red">✖ {error}</Text>;
  }

  const out = `dist/${toExtensionId(answers.projectName)}.js`;
  const runBuild =
    answers.packageManager === 'npm'
      ? 'npm run build'
      : `${answers.packageManager} build`;

  return (
    <Box flexDirection="column">
      <Text>
        Scaffolding <Text color="cyan">{answers.projectName}</Text> with{' '}
        <Text color="cyan">{BUNDLERS[answers.bundler].label}</Text>
      </Text>
      {written.map((rel) => (
        <Text key={rel}>
          {'  '}
          <Text color="green">+</Text> {rel}
        </Text>
      ))}

      {phase === 'install' && (
        <Box marginTop={1}>
          <Text>
            <Spinner /> Installing dependencies with {answers.packageManager}…
          </Text>
        </Box>
      )}

      {phase === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          {install &&
            (installed ? (
              <Text color="green">
                ✔ Installed dependencies with {answers.packageManager}
              </Text>
            ) : (
              <Text color="yellow">
                ! Install failed — run `{installCommand(answers.packageManager)}
                ` yourself
              </Text>
            ))}
          <Box height={1} />
          <Text color="green" bold>
            Next steps:
          </Text>
          <Text>{`  cd ${answers.projectName}`}</Text>
          {install && !installed && (
            <Text>{`  ${installCommand(answers.packageManager)}`}</Text>
          )}
          <Text>
            {`  ${runBuild}`}
            <Text dimColor>{`   # build ${out}`}</Text>
          </Text>
          <Box height={1} />
          <Text>
            Then load <Text bold>{out}</Text> into TurboWarp as a custom
            extension.
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Render the app and resolve when it reaches a terminal state.
 *
 * @param {{ initial: Answers, prompts: string[], install: boolean, force: boolean }} opts
 * @returns {Promise<{ ok: boolean, error?: string, cancelled?: boolean }>}
 */
export function runApp(opts) {
  return new Promise((resolve) => {
    /** @type {{ ok: boolean, error?: string } | null} */
    let result = null;
    const { waitUntilExit } = render(
      <App
        initial={opts.initial}
        prompts={opts.prompts}
        install={opts.install}
        force={opts.force}
        onDone={(r) => {
          result = r;
        }}
      />,
    );
    waitUntilExit().then(
      // No onDone fired ⇒ the user aborted (Ctrl-C) before finishing.
      () => resolve(result || { ok: false, cancelled: true }),
      () => resolve(result || { ok: false, cancelled: true }),
    );
  });
}
