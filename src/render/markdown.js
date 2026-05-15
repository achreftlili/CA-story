/**
 * Render a PRStory as GitHub-flavored markdown suitable for pasting into
 * a PR description. Sections: TL;DR, Chapters, Decisions Log, Your Calls.
 * @param {import('../consolidate.js').PRStory} story
 */
export function renderPrMarkdown(story) {
  const tldr = (story.chapters.slice(0, 2).map((c) => `- ${c.title}`).join('\n')) || '_(no chapters)_';

  const chapters = story.chapters
    .map((c, i) => {
      const files = c.files_touched.length
        ? c.files_touched.map((f) => `\`${f}\``).join(', ')
        : '_(no files)_';
      const actions = c.events
        .filter((e) => e.type === 'action')
        .slice(0, 12)
        .map((a) => `  - ${escapeMd(a.raw_text)}`)
        .join('\n');
      return `### ${i + 1}. ${escapeMd(c.title || 'Untitled')}

**Files:** ${files}

${actions || '_(no actions captured)_'}`;
    })
    .join('\n\n');

  const decisions = story.chapters
    .flatMap((c) => c.events.filter((e) => e.type === 'decision'))
    .map((d) => `- ${escapeMd(oneLine(d.raw_text))}`)
    .join('\n');

  const interventions = story.chapters
    .flatMap((c) => c.interventions)
    .map((i) => `- 📌 ${escapeMd(oneLine(i.raw_text))}`)
    .join('\n');

  return `# PR Story — \`${escapeMd(story.branch)}\`

_Generated from ${story.session_ids.length} Claude Code session(s)._

## TL;DR

${tldr}

## Chapters

${chapters || '_(none)_'}

## Decisions Log

${decisions || '_(none captured)_'}

## Your Calls

${interventions || '_(no interventions recorded)_'}
`;
}

function oneLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function escapeMd(s) {
  // Minimal escaping so headings/lists from raw text don't break layout.
  return String(s ?? '').replace(/([\\`*_{}[\]<>#+\-!|])/g, '\\$1');
}
