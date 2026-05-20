import { DEFAULT_CHAT_MODELS, DEFAULT_PROVIDERS } from '../../../constants'
import { SettingMigration } from '../setting.types'

import { DEFAULT_CHAT_MODELS_V15 } from './14_to_15'
import {
  DefaultChatModels,
  getMigratedChatModels,
  getMigratedProviders,
} from './migrationUtils'

const DEFAULT_CHAT_MODELS_V16 = [
  ...DEFAULT_CHAT_MODELS_V15.slice(0, 3),
  {
    providerType: 'gemini-plan',
    providerId: 'gemini-plan',
    id: 'gemini-3-pro-preview (plan)',
    model: 'gemini-3-pro-preview',
  },
  {
    providerType: 'gemini-plan',
    providerId: 'gemini-plan',
    id: 'gemini-3-flash-preview (plan)',
    model: 'gemini-3-flash-preview',
  },
  ...DEFAULT_CHAT_MODELS_V15.slice(3),
] as DefaultChatModels

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison)
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalizeForComparison(
          (value as Record<string, unknown>)[key],
        )
        return result
      }, {})
  }
  return value
}

function isExactDefaultChatModel(model: unknown): boolean {
  return DEFAULT_CHAT_MODELS_V16.some((defaultModel) => {
    return (
      JSON.stringify(normalizeForComparison(model)) ===
      JSON.stringify(normalizeForComparison(defaultModel))
    )
  })
}

export const migrateFrom16To17: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 17

  if ('chatModels' in newData && Array.isArray(newData.chatModels)) {
    newData.chatModels = newData.chatModels.filter(
      (model) => !isExactDefaultChatModel(model),
    )
  }

  newData.providers = getMigratedProviders(newData, DEFAULT_PROVIDERS)
  newData.chatModels = getMigratedChatModels(newData, [
    ...DEFAULT_CHAT_MODELS,
  ] as DefaultChatModels)

  return newData
}
