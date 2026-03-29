import type { APIRoute } from 'astro'
import { repoUrl } from '../data/site'
import { buildAbsoluteUrl } from '../data/seo'

export const GET: APIRoute = () => {
  const body = '\uFEFF' + [
    '# DevCue One',
    '',
    '> A local macOS desktop voice assistant for coding and multi-session development workflows.',
    '',
    'DevCue One lets you speak naturally to coding tools such as Codex, Claude Code, Gemini CLI, Cursor CLI, and Qwen Code so engineering work can keep moving while you stay away from the keyboard.',
    '',
    '## Primary pages',
    `- [English product page](${buildAbsoluteUrl('/en/')}): Product overview, workflow, and download entry.`,
    `- [中文产品页](${buildAbsoluteUrl('/zh/')}): 中文介绍、下载入口与使用场景。`,
    `- [Privacy](${buildAbsoluteUrl('/en/privacy/')}): Privacy notes for the local desktop client.`,
    `- [Terms](${buildAbsoluteUrl('/en/terms/')}): Terms for using the local desktop client.`,
    '',
    '## Links',
    `- [GitHub repository](${repoUrl})`,
    `- [Download section](${buildAbsoluteUrl('/en/#download')})`,
    `- [Full LLM notes](${buildAbsoluteUrl('/llms-full.txt')})`
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  })
}
