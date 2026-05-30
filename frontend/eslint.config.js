import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import jsdoc from 'eslint-plugin-jsdoc'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/api/generated', 'src/api/model']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      jsdoc,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'jsdoc/require-file-overview': ['error', {
        tags: {
          file: { initialCommentsOnly: true, mustExist: true }
        }
      }],
      'no-magic-numbers': ['warn', { 
        'ignore': [-1, 0, 1, 2, 3, 4, 8, 12, 16, 20, 24, 32, 48, 64, 100], 
        'ignoreArrayIndexes': true,
        'enforceConst': true,
        'detectObjects': false
      }]
    }
  },
])
