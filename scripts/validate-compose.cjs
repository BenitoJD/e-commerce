#!/usr/bin/env node
// Structural validation for docker-compose.yml.
//
// Two failure modes this catches that plain YAML parsing does not:
//  1. Duplicate keys (YAML silently keeps the last one, so a duplicated build arg hides).
//  2. Keys placed at the wrong indent level — e.g. a build arg accidentally promoted to a
//     service-level key, which `docker compose` rejects at deploy time with a confusing error.
//
// Uses the bundled Python + PyYAML when available; otherwise does a conservative textual
// check so it still works on a bare Node host.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'docker-compose.yml');

const SERVICE_KEYS = new Set([
  'image', 'build', 'restart', 'depends_on', 'environment', 'ports', 'volumes',
  'expose', 'healthcheck', 'command', 'entrypoint', 'networks', 'profiles',
]);

const PY = `
import sys, yaml

class UniqueKeyLoader(yaml.SafeLoader):
    pass

def construct_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise ValueError(f"duplicate key '{key}'")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping

UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, construct_mapping)

with open(sys.argv[1], encoding='utf-8') as fh:
    try:
        doc = yaml.load(fh, Loader=UniqueKeyLoader)
    except Exception as exc:  # malformed YAML (indentation, stray colon, ...)
        print(str(exc).strip().splitlines()[0])
        sys.exit(2)

services = doc.get('services') or {}
allowed = set(sys.argv[2].split(','))
problems = []
for name, svc in services.items():
    if not isinstance(svc, dict):
        problems.append(f"{name}: not a mapping")
        continue
    for key in svc:
        if key not in allowed:
            problems.append(f"{name}: unexpected service key '{key}'")
    build = svc.get('build')
    if isinstance(build, dict):
        for key in build:
            if key not in ('context', 'dockerfile', 'args', 'target'):
                problems.append(f"{name}.build: unexpected key '{key}'")
print('; '.join(problems))
sys.exit(2 if problems else 0)
`;

function runPython() {
  const candidates = [process.env.PYTHON, process.env.PYTHON_PATH, 'python3', 'python', 'py'].filter(Boolean);
  for (const exe of candidates) {
    const res = spawnSync(exe, ['-c', 'import yaml,sys; print("ok")'], { encoding: 'utf8' });
    if (res.error || res.status !== 0) continue; // missing, or the Windows Store stub
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    if (!/ok/.test(out)) continue; // e.g. "Python was not found" alias message
    const real = spawnSync(exe, ['-c', PY, FILE, [...SERVICE_KEYS].join(',')], { encoding: 'utf8' });
    if (real.error) continue;
    return real;
  }
  return null; // no usable python + pyyaml: caller falls back to textual checks
}

// Fallback: detect a build-arg-looking key indented less than the args block.
function textualCheck(text) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  let inStorefrontArgs = false;
  let argsIndent = -1;
  lines.forEach((line, i) => {
    if (/^\s*args:\s*$/.test(line)) {
      argsIndent = line.match(/^\s*/)[0].length;
      inStorefrontArgs = true;
      return;
    }
    if (!inStorefrontArgs) return;
    if (!line.trim()) return;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= argsIndent) inStorefrontArgs = false;
    else if (!/^\s+[A-Z0-9_]+:/.test(line)) problems.push(`line ${i + 1}: unexpected content inside args`);
  });
  const seen = new Map();
  lines.forEach((line, i) => {
    const m = line.match(/^(\s+)([A-Z0-9_]+):/);
    if (!m) return;
    const key = `${m[1].length}:${m[2]}`;
    if (seen.has(key)) problems.push(`line ${i + 1}: duplicate ${m[2]} at same indent (first at line ${seen.get(key)})`);
    else seen.set(key, i + 1);
  });
  return problems;
}

function main() {
  const text = fs.readFileSync(FILE, 'utf8');
  const py = runPython();
  let problems = [];
  let mode = 'python+yaml';
  if (py === null) {
    mode = 'textual';
    problems = textualCheck(text);
  } else if (py.status === 0) {
    problems = py.stdout.split(';').map((s) => s.trim()).filter(Boolean);
  } else {
    problems = (py.stdout + py.stderr).split(';').map((s) => s.trim()).filter(Boolean);
    if (!problems.length) problems = ['yaml parse failed'];
  }

  if (problems.length) {
    console.error(`docker-compose.yml problems (${mode}):`);
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }
  console.log(`docker-compose.yml OK (${mode})`);
}

if (require.main === module) main();
module.exports = { SERVICE_KEYS, textualCheck };
