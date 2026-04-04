const [majorSegment = '0'] = process.versions.node.split('.')
const majorVersion = Number.parseInt(majorSegment, 10)

if (Number.isFinite(majorVersion) && majorVersion >= 22) {
  process.exit(0)
}

console.error(
  [
    `DevCue One requires Node.js 22+. Current version: ${process.versions.node}.`,
    'Run `nvm install 22 && nvm use 22`, then retry.',
  ].join('\n'),
)
process.exit(1)
