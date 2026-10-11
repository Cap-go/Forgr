// import.meta.glob only exists under Vite; bun test runs without the skills.
const files = (typeof import.meta.glob === 'function'
  ? import.meta.glob('./skills/*.md', { query: '?raw', import: 'default', eager: true })
  : {}) as Record<string, string>;

interface Skill {
  name: string;
  description: string;
  body: string;
}

const skills: Skill[] = Object.entries(files).map(([path, body]) => {
  const name = path.replace(/^.*\/(.+)\.md$/, '$1');
  const description = /^description:\s*(.+)$/m.exec(body)?.[1]?.slice(0, 300) ?? '';
  return { name, description, body };
});

/** Capgo skills bundled with the app so the builder model can consult them. */
export function listSkills(): Array<{ name: string; description: string }> {
  return skills.map(({ name, description }) => ({ name, description }));
}

export function readSkill(name: string): string {
  const skill = skills.find((s) => s.name === name.trim());
  if (!skill) throw new Error(`Unknown skill "${name}". Call list_skills.`);
  return skill.body;
}
