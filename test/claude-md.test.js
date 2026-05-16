import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClaudeMd, compileGlobs } from '../src/util/claude-md.js';

test('claude-md: parses explicit prstory:config block', () => {
  const text = `# Hi
hello world.

<!-- prstory:config
display_name: prstory
description: Local CLI for PR stories
base_branch: master
important_files:
  - src/extract.js
  - src/render/**
tags: [tooling, review]
-->`;
  const cfg = parseClaudeMd(text);
  assert.equal(cfg.display_name, 'prstory');
  assert.equal(cfg.description, 'Local CLI for PR stories');
  assert.equal(cfg.base_branch, 'master');
  assert.deepEqual(cfg.important_files, ['src/extract.js', 'src/render/**']);
  assert.deepEqual(cfg.tags, ['tooling', 'review']);
});

test('claude-md: falls back to H1 + first paragraph when no config block', () => {
  const text = `# My Project\n\nA tool for doing things.\n\nMore body.`;
  const cfg = parseClaudeMd(text);
  assert.equal(cfg.display_name, 'My Project');
  assert.match(cfg.description, /tool for doing things/);
});

test('claude-md: explicit fields override H1', () => {
  const text = `# Old Name\n\n<!-- prstory:config\ndisplay_name: New Name\n-->`;
  const cfg = parseClaudeMd(text);
  assert.equal(cfg.display_name, 'New Name');
});

test('claude-md: compileGlobs matches expected paths', () => {
  const match = compileGlobs(['src/extract.js', 'src/render/**', '**/*.test.js']);
  assert.equal(match('/repo/src/extract.js', '/repo'), true);
  assert.equal(match('/repo/src/render/templates/x.js', '/repo'), true);
  assert.equal(match('/repo/test/foo.test.js', '/repo'), true);
  assert.equal(match('/repo/src/other.js', '/repo'), false);
});
