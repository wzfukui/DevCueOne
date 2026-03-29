export type Locale = 'en' | 'zh'

export interface NavItem {
  href: string
  label: string
}

export interface StepItem {
  index: string
  title: string
  body: string
}

export interface FeatureItem {
  eyebrow: string
  title: string
  body: string
}

export interface ShowcaseItem {
  title: string
  body: string
  caption: string
}

export interface StackItem {
  title: string
  body: string
}

export interface SiteLocaleContent {
  title: string
  description: string
  brand: string
  brandKicker: string
  slogan: string
  nav: NavItem[]
  hero: {
    eyebrow: string
    title: string
    lead: string
    primaryCta: string
    secondaryCta: string
    panelLabel: string
    voiceLabel: string
    routeLabel: string
    outputLabel: string
    voiceValue: string
    routeValue: string
    outputValue: string
  }
  heroAside: {
    label: string
    items: string[]
  }
  proof: string[]
  flowTitle: string
  flowIntro: string
  steps: StepItem[]
  featuresTitle: string
  featuresIntro: string
  features: FeatureItem[]
  showcaseTitle: string
  showcaseIntro: string
  showcases: ShowcaseItem[]
  stackTitle: string
  stackIntro: string
  stack: StackItem[]
  closingTitle: string
  closingLead: string
  closingPrimary: string
  closingSecondary: string
  footerNote: string
}

export const repoUrl = 'https://github.com/wzfukui/DevCueOne'

export const siteContent: Record<Locale, SiteLocaleContent> = {
  en: {
    title: 'DevCue One | Desktop Voice Assistant for Coding and Multi-Session Development',
    description:
      'DevCue One is a local macOS desktop voice assistant for coding. Speak to Codex, Claude Code, Gemini CLI, Cursor CLI, and Qwen Code to keep multi-session engineering work moving.',
    brand: 'DevCue One',
    brandKicker: 'VOICE-DRIVEN DESKTOP FLOW',
    slogan: 'Speak it. Ship it.',
    nav: [
      { href: '#flow', label: 'How it moves' },
      { href: '#highlights', label: 'Why it wins' },
      { href: '#showcase', label: 'Three moments' },
      { href: '#stack', label: 'Where it fits' }
    ],
    hero: {
      eyebrow: 'If you can say it, you can code it.',
      title: 'Still coding. Not stuck at the keyboard.',
      lead:
        'DevCue One lets you use natural language to direct Codex, Claude Code, Gemini, and other coding tools, so work starts moving the moment you speak. Less keyboard time, more parallel momentum, and real progress even when you step away from the desk.',
      primaryCta: 'See how it moves',
      secondaryCta: 'See the three moments',
      panelLabel: 'One spoken request, multiple things moving',
      voiceLabel: 'You say',
      routeLabel: 'The app fans it out',
      outputLabel: 'You come back to progress',
      voiceValue: '"Tighten the launch page copy, sync English too, and make the whole thing hit harder."',
      routeValue: 'That request keeps its context, spreads across active work, and keeps moving while you handle something else.',
      outputValue: 'By the time you look again, the work has advanced instead of waiting for you to sit back down.'
    },
    heroAside: {
      label: 'Why people remember it',
      items: [
        'Spoken coding feels natural within minutes',
        'Parallel work keeps moving without micromanaging every step',
        'The keyboard stops being the price of staying productive'
      ]
    },
    proof: [
      'Speak to Codex / Claude Code / Gemini',
      'Parallel work keeps moving',
      'Half-reclined coding is real'
    ],
    flowTitle: 'Three beats: say it, leave it, come back to momentum.',
    flowIntro:
      'This product makes sense in moments, not configuration screens. You speak, the work spreads out, and you return to progress instead of dead air.',
    steps: [
      {
        index: '01',
        title: 'Say it the way it comes to mind',
        body:
          'Ideas, fixes, rewrites, priorities, and tone can all be spoken naturally. You do not need to flatten your thoughts into command syntax first.'
      },
      {
        index: '02',
        title: 'Let several threads move in parallel',
        body:
          'New work does not have to wait in line behind old work. DevCue One keeps multiple streams moving so your day can stay messy without stalling.'
      },
      {
        index: '03',
        title: 'Rejoin without reloading your brain',
        body:
          'When you come back, you see progress, context, and the next move in one place instead of reconstructing the situation from scratch.'
      }
    ],
    featuresTitle: 'It is not selling voice input. It is selling freedom from the desk.',
    featuresIntro:
      'The special part is not that it transcribes words. The special part is that coding can keep moving while your attention briefly lives elsewhere.',
    features: [
      {
        eyebrow: 'SPOKEN CODING',
        title: 'Talk to the work like it is already alive',
        body:
          'Ask for edits, direction, tone, or follow-ups in plain language and let the product turn that into forward motion.'
      },
      {
        eyebrow: 'PARALLEL',
        title: 'More than one thing can move at once',
        body:
          'You can keep a rewrite, a fix, and a follow-up all advancing together instead of babysitting one task at a time.'
      },
      {
        eyebrow: 'AWAY FROM DESK',
        title: 'Your body can leave the keyboard',
        body:
          'Coffee break, messages, a quick lap around the room, even a half-reclined reset. The work does not need you frozen in front of a monitor.'
      },
      {
        eyebrow: 'REENTRY',
        title: 'Coming back feels instant, not expensive',
        body:
          'Context and progress stay visible, so stepping away no longer means paying a mental tax to restart.'
      }
    ],
    showcaseTitle: 'People remember three moments, not twelve feature bullets.',
    showcaseIntro:
      'These are the moments that sell the product in real life: when you speak, when you step away, and when you return.',
    showcases: [
      {
        title: 'The moment you speak',
        body: 'A natural sentence carries intent, tone, and direction without forcing you to translate yourself into CLI grammar.',
        caption: 'Say it like a person, not a config file.'
      },
      {
        title: 'The moment you walk away',
        body: 'Work keeps running while you grab coffee, answer messages, or let your eyes leave the screen for a minute.',
        caption: 'The desk stops being a leash.'
      },
      {
        title: 'The moment you sit back down',
        body: 'Instead of a blank reset, you come back to visible progress and a clear next move.',
        caption: 'Leave. Return. Keep going.'
      }
    ],
    stackTitle: 'This fits real days, not idealized desk time.',
    stackIntro:
      'If your attention gets interrupted by chats, meetings, walking, or sudden ideas, this workflow feels more honest than sit still and type until it is done.',
    stack: [
      {
        title: 'Great for broken-up time',
        body: 'Short pockets of time become usable because you can speak work forward instead of waiting for a full keyboard session.'
      },
      {
        title: 'Built for multi-threaded brains',
        body: 'If you naturally jump between ideas, DevCue One lets those threads keep moving instead of punishing the switch.'
      },
      {
        title: 'Less chair time, more progress',
        body: 'The point is not to type faster. The point is to let progress continue without treating the chair as mandatory.'
      }
    ],
    closingTitle: 'Free the hands. Keep the momentum.',
    closingLead:
      'DevCue One is for people who want coding to move with their voice, their day, and their attention span instead of being locked to the keyboard.',
    closingPrimary: 'Back to the three beats',
    closingSecondary: 'View on GitHub',
    footerNote:
      'Spoken coding, parallel momentum, and less dependence on the desk. That is the product, not a side feature.'
  },
  zh: {
    title: 'DevCue One | 桌面语音编程助手，多会话开发工作流',
    description:
      'DevCue One 是本地 macOS 桌面语音编程助手。你可以开口调用 Codex、Claude Code、Gemini CLI、Cursor CLI、Qwen Code，让多会话工程任务持续推进。',
    brand: 'DevCue One',
    brandKicker: '语音驱动的桌面开发工作流',
    slogan: 'Speak it. Ship it.',
    nav: [
      { href: '#flow', label: '怎么运转' },
      { href: '#highlights', label: '为什么能打' },
      { href: '#showcase', label: '三个瞬间' },
      { href: '#stack', label: '适合什么' }
    ],
    hero: {
      eyebrow: '能动口就绝不动手。',
      title: '双手离开键盘也能编程？！',
      lead:
        'DevCue One 让你用自然语言或口头表达，直接调用 Codex、Claude Code、Gemini 等开发工具，把需求、语气和优先级一口气交代下去。你一开口，任务就开始推进；少一点键盘时间，多一点并行推进，不在电脑前也不耽误工作。',
      primaryCta: '看它怎么运转',
      secondaryCta: '看三个关键瞬间',
      panelLabel: '一句话下去，几件事一起动起来',
      voiceLabel: '你开口',
      routeLabel: '系统并行推进',
      outputLabel: '你回来收结果',
      voiceValue: '“把首页文案改得更能打，英文也一起同步，整体语气再狠一点。”',
      routeValue: '这句要求会带着上下文拆进实际工作里，几条任务能同时往前走，不用你守在电脑前。',
      outputValue: '你去喝咖啡、回消息、走两步，回来看到的不是静止页面，而是已经推进过的结果。'
    },
    heroAside: {
      label: '为什么这东西会让人上头',
      items: [
        '口说编程不是概念，而是真的能推进工作',
        '多条事情可以并行，不用一件件盯着守',
        '人可以离开键盘，项目不必跟着停住'
      ]
    },
    proof: [
      '口头直连 Codex / Claude Code / Gemini',
      '多任务并行推进',
      '躺着也能编程'
    ],
    flowTitle: '三个节拍：开口，下放，回来接上。',
    flowIntro:
      '这产品不是拿配置页面来打动人，而是靠三个瞬间让你立刻懂：说出去，事情动起来；人走开，任务还在跑；再回来，进度已经在你前面。',
    steps: [
      {
        index: '01',
        title: '怎么说都行，只要先说出去',
        body:
          '需求、限制、语气、优先级，直接按你脑子里的样子说出来，不必先把自己翻译成命令。'
      },
      {
        index: '02',
        title: '让几条事情同时往前推',
        body:
          '新任务不必等旧任务结束，多条线程可以一起跑，更适合真实生活里那种不断被打断的工作节奏。'
      },
      {
        index: '03',
        title: '回来时不用重新热机',
        body:
          '进度、上下文和下一步都留在同一个地方，离开一下再回来，也不用重新找感觉。'
      }
    ],
    featuresTitle: '它卖的不是“语音输入”，它卖的是从键盘上松绑。',
    featuresIntro:
      '真正有特色的地方，不是把字说进输入框，而是你可以一边说、一边分心处理别的事，项目还照样往前走。',
    features: [
      {
        eyebrow: '口说编程',
        title: '像下指令一样把代码往前推',
        body:
          '改什么、怎么改、要狠一点还是收一点，都可以直接说，产品会把它变成持续推进的工作。'
      },
      {
        eyebrow: '并行',
        title: '不止一件事，可以同时动起来',
        body:
          '重写、修 bug、补英文、改语气，这些事不必排成一列，你想到什么就可以先让它跑。'
      },
      {
        eyebrow: '离键盘',
        title: '人走开了，项目也不会原地等你',
        body:
          '去拿咖啡、回消息、站起来活动，甚至躺着缓一会儿，任务也不至于跟着一起暂停。'
      },
      {
        eyebrow: '回场',
        title: '重新坐回来，马上就能接上',
        body:
          '不是回来面对一页空白，而是直接看到状态、结果和下一步，脑子不用再重新点火。'
      }
    ],
    showcaseTitle: '用户会记住的，不是功能名，而是三个瞬间。',
    showcaseIntro:
      '真正能把人打动的不是某个模块，而是这三个身体能感觉到的时刻：开口那一刻，离开那一刻，回来那一刻。',
    showcases: [
      {
        title: '开口那一刻',
        body: '一句自然话就能带着意图、范围和语气下去，不需要先把自己翻译成工具语言。',
        caption: '想到什么，就怎么说。'
      },
      {
        title: '离开那一刻',
        body: '你去喝咖啡、刷手机、回消息，任务还在后台并行推进，不需要你盯着进度条守着。',
        caption: '手离开键盘，事没停。'
      },
      {
        title: '回来那一刻',
        body: '你看到的已经是推进后的结果和下一步，不是一个等你重新解释的空壳。',
        caption: '回来就能继续。'
      }
    ],
    stackTitle: '它适合真实的一天，不适合假装理想的工作状态。',
    stackIntro:
      '如果你的日常经常被会议、消息、走动、灵感打断，这套方式会比坐定再慢慢打字更贴近真实生活。',
    stack: [
      {
        title: '碎片时间也能编程',
        body: '几分钟空档都能口头往前推任务，让零碎时间不再只够刷两下消息。'
      },
      {
        title: '多线程脑子会更舒服',
        body: '想到新的事情，不必强迫自己先记下来再切回去，你可以直接说出去，让它先跑。'
      },
      {
        title: '少一点坐牢感，多一点推进感',
        body: '重点不是让你更会敲键盘，而是让你少一点被键盘、椅子和桌面绑住。'
      }
    ],
    closingTitle: '把手腾出来，把事继续做完。',
    closingLead:
      'DevCue One 的价值不是能听懂你说话，而是让你离开键盘之后，编程这件事还在继续向前。',
    closingPrimary: '回到三个节拍',
    closingSecondary: '去 GitHub 看看',
    footerNote:
      '口说编程、多任务并行、离开键盘也能推进，这才是它真正的产品定义。'
  }
}
