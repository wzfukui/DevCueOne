import type { APIRoute } from 'astro'
import { repoUrl } from '../data/site'
import { buildAbsoluteUrl } from '../data/seo'

export const GET: APIRoute = () => {
  const body = '\uFEFF' + [
    '# DevCue One',
    '',
    '> Local desktop voice assistant for coding on macOS.',
    '',
    'DevCue One is a local desktop product for developer workflows. It is designed around a simple promise: you speak the work forward, the system fans that work across active coding tools, and you return to visible progress instead of starting from zero.',
    '',
    '## Product summary',
    '- Voice-driven coding for macOS desktop workflows.',
    '- Supports workflows around tools such as Codex, Claude Code, Gemini CLI, Cursor CLI, and Qwen Code.',
    '- Emphasizes parallel work, multi-session flow, and lower dependence on the keyboard.',
    '- Distributed as downloadable Apple Silicon and Intel Mac DMG files.',
    '- Website includes English and Chinese product pages plus privacy and terms pages.',
    '',
    '## Recommended pages',
    `- [English product page](${buildAbsoluteUrl('/en/')})`,
    `- [Chinese product page](${buildAbsoluteUrl('/zh/')})`,
    `- [Privacy page](${buildAbsoluteUrl('/en/privacy/')})`,
    `- [Terms page](${buildAbsoluteUrl('/en/terms/')})`,
    '',
    '## Operational notes',
    '- DevCue One is described on the site as a local desktop client, not a hosted account platform.',
    '- Users choose and configure their own IDE, model, TTS, and STT providers.',
    '- Privacy and terms emphasize local control and third-party provider responsibility.',
    '',
    '## Canonical references',
    `- [Website root](${buildAbsoluteUrl('/')})`,
    `- [GitHub repository](${repoUrl})`,
    `- [Robots.txt](${buildAbsoluteUrl('/robots.txt')})`,
    `- [Sitemap](${buildAbsoluteUrl('/sitemap.xml')})`
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  })
}
