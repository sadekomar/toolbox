import tseslint from 'typescript-eslint'
import sonarjs from 'eslint-plugin-sonarjs'
import reactHooks from 'eslint-plugin-react-hooks'

const PEDANTIC = process.env.PRECHECK_PEDANTIC === '1'

const DEEP_RELATIVE = {
  group: ['../../../*'],
  message: 'Use a path alias (@dashboard/*, @ui/*, @/modules/*) instead of walking up directories.'
}

const BACKEND_SRC = {
  group: ['**/packages/backend/src/*', '@backend/src/*'],
  message: 'Backend types are read-only: import from @backend/* (dist-types), never from src.'
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-types/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/generated/**',
      '**/prisma/generated/**',
      '**/*.d.ts'
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.ts', '*.tsx'] }
      }
    },
    plugins: { sonarjs },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // checksVoidReturn off: every Express route here is `async (req, res)`,
      // which the check flags wholesale. Real concern, but it is one repo-wide
      // decision (Express 5 / express-async-errors), not a per-PR finding.
      // The high-signal half of the rule — `if (promise)`, `promise && x` — stays on.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/require-await': PEDANTIC ? 'warn' : 'off',
      '@typescript-eslint/no-unnecessary-condition': PEDANTIC ? 'warn' : 'off',
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' }
      ],

      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-duplicated-branches': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/prefer-immediate-return': 'warn',

      'no-restricted-imports': ['warn', { patterns: [DEEP_RELATIVE, BACKEND_SRC] }]
    }
  },
  {
    files: ['packages/{dashboard,page,homepage,now,ui,admin}/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    // CLAUDE.md: components go through resolvers/ and never call tRPC directly.
    files: ['packages/dashboard/{components,layouts,app}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            DEEP_RELATIVE,
            BACKEND_SRC,
            {
              group: ['**/lib/trpc', '@dashboard/lib/trpc'],
              message: 'Components use a resolvers/ hook, not useTRPC directly.'
            }
          ]
        }
      ]
    }
  },
  {
    // CLAUDE.md: business logic lives in use-cases, not in the procedure layer.
    files: ['packages/backend/src/modules/*/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['@prisma/client'],
              allowTypeImports: true,
              message: 'Procedures delegate to a use-case; keep Prisma out of this layer.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**', '**/__tests__/**'],
    rules: {
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/cognitive-complexity': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'no-restricted-imports': 'off'
    }
  }
)
