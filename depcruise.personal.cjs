module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Cycles make load order and refactoring unpredictable.',
      from: {},
      to: { circular: true }
    },
    {
      name: 'no-cross-module-use-cases',
      severity: 'warn',
      comment:
        'One module driving another module business logic directly. helpers/ is ' +
        'shared on purpose here and is deliberately not covered by this rule.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/use-cases/',
        pathNot: '^src/modules/$1/'
      }
    },
    {
      name: 'use-cases-stay-off-http',
      severity: 'warn',
      comment: 'Use-cases hold business logic and should not know about Express or tRPC.',
      from: { path: '^src/modules/[^/]+/use-cases/' },
      to: { dependencyTypes: ['npm'], path: '^(express|@trpc)' }
    },
    {
      name: 'no-orphan-modules',
      severity: 'warn',
      comment: 'Nothing imports this file — dead code, or a missing wire-up.',
      from: { orphan: true, pathNot: '\\.d\\.ts$|/types?\\.ts$|/index\\.ts$' },
      to: {}
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: 'node_modules|/dist/|/dist-types/|\\.next/|/generated/|prisma/generated|\\.test\\.tsx?$|/tests?/'
    },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default']
    },
    reporterOptions: { text: { highlightFocused: true } }
  }
}
