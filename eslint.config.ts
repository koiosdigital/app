import js from '@eslint/js'
import ts from 'typescript-eslint'

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser'
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  }
)
