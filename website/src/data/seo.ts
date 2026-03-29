export const siteUrl = 'https://devcue.one'

export const defaultOgImage = {
  path: '/screens/devcue-one-og.jpg',
  width: 1200,
  height: 630,
  alt: {
    en: 'Abstract editorial visual of voice input turning into terminal-like command flows for DevCue One',
    zh: 'DevCue One 的抽象分享图，表现语音输入转化为命令行式任务流'
  }
} as const

export const localeKeywords = {
  en: [
    'desktop voice assistant for coding',
    'voice coding desktop app',
    'macOS coding assistant',
    'multi-session development workflow',
    'Codex desktop workflow',
    'Claude Code desktop workflow',
    'Gemini CLI coding workflow',
    'Cursor CLI voice workflow',
    'Qwen Code voice workflow',
    'DevCue One'
  ],
  zh: [
    '桌面语音编程助手',
    '语音编程',
    'macOS 编程助手',
    '多会话开发工作流',
    'Codex 语音调用',
    'Claude Code 语音调用',
    'Gemini CLI',
    'Cursor CLI',
    'Qwen Code',
    'DevCue One'
  ]
} as const

export const legalKeywords = {
  en: {
    privacy: [
      'DevCue One privacy',
      'local desktop app privacy',
      'voice coding privacy',
      'developer tool privacy'
    ],
    terms: [
      'DevCue One terms',
      'desktop app terms',
      'voice coding terms',
      'developer workflow terms'
    ]
  },
  zh: {
    privacy: ['DevCue One 隐私', '本地桌面应用隐私', '语音编程隐私', '开发工具隐私'],
    terms: ['DevCue One 条款', '本地桌面应用条款', '语音编程条款', '开发工具条款']
  }
} as const

export const buildAbsoluteUrl = (path: string) => new URL(path, siteUrl).toString()

export const localizedAlternates = (enPath: string, zhPath: string) => [
  { hrefLang: 'en', href: buildAbsoluteUrl(enPath) },
  { hrefLang: 'zh-CN', href: buildAbsoluteUrl(zhPath) },
  { hrefLang: 'x-default', href: buildAbsoluteUrl('/') }
]

export const sitemapRoutes = ['/en/', '/zh/', '/en/privacy/', '/en/terms/', '/zh/privacy/', '/zh/terms/']
