import { DEFAULT_CHAT_MODELS, DEFAULT_PROVIDERS } from '../../../constants'

import { migrateFrom16To17 } from './16_to_17'

describe('Migration from v16 to v17', () => {
  it('should increment version to 17', () => {
    const oldSettings = {
      version: 16,
    }

    const result = migrateFrom16To17(oldSettings)

    expect(result.version).toBe(17)
  })

  it('should add v17 default providers and preserve custom providers', () => {
    const oldSettings = {
      version: 16,
      providers: [
        { type: 'openai', id: 'openai', apiKey: 'openai-key' },
        { type: 'custom', id: 'custom-provider', apiKey: 'custom-key' },
      ],
      chatModels: [],
    }

    const result = migrateFrom16To17(oldSettings)

    expect(result.providers).toEqual([
      ...DEFAULT_PROVIDERS.map((provider) =>
        provider.type === 'openai'
          ? { ...provider, apiKey: 'openai-key' }
          : provider,
      ),
      { type: 'custom', id: 'custom-provider', apiKey: 'custom-key' },
    ])
  })

  it('should remove exact obsolete v16 default models and insert v17 defaults', () => {
    const oldSettings = {
      version: 16,
      providers: [],
      chatModels: [
        {
          providerType: 'anthropic-plan',
          providerId: 'anthropic-plan',
          id: 'claude-opus-4.5 (plan)',
          model: 'claude-opus-4-5',
          thinking: {
            enabled: true,
            budget_tokens: 8192,
          },
        },
        {
          providerType: 'openai',
          providerId: 'openai',
          id: 'gpt-5.2',
          model: 'gpt-5.2',
        },
        {
          providerType: 'gemini-plan',
          providerId: 'gemini-plan',
          id: 'gemini-3-pro-preview (plan)',
          model: 'gemini-3-pro-preview',
        },
      ],
    }

    const result = migrateFrom16To17(oldSettings)
    const chatModels = result.chatModels as {
      id: string
      providerType: string
      providerId: string
      model: string
    }[]

    expect(chatModels.find((model) => model.id === 'gpt-5.2')).toBeUndefined()
    expect(
      chatModels.find((model) => model.id === 'claude-opus-4.5 (plan)'),
    ).toBeUndefined()
    expect(
      chatModels.find((model) => model.id === 'gemini-3-pro-preview (plan)'),
    ).toBeUndefined()

    expect(chatModels).toEqual(DEFAULT_CHAT_MODELS)
  })

  it('should preserve user-modified stale defaults as custom models', () => {
    const oldSettings = {
      version: 16,
      providers: [],
      chatModels: [
        {
          providerType: 'openai',
          providerId: 'openai',
          id: 'gpt-5.2',
          model: 'gpt-5.2',
          enable: false,
        },
        {
          id: 'custom-model',
          providerType: 'custom',
          providerId: 'custom-provider',
          model: 'custom-model',
        },
      ],
    }

    const result = migrateFrom16To17(oldSettings)
    const chatModels = result.chatModels as {
      id: string
      providerType: string
      providerId: string
      model: string
      enable?: boolean
    }[]

    expect(chatModels.find((model) => model.id === 'gpt-5.5')).toBeDefined()
    expect(chatModels.find((model) => model.id === 'gpt-5.2')).toEqual({
      providerType: 'openai',
      providerId: 'openai',
      id: 'gpt-5.2',
      model: 'gpt-5.2',
      enable: false,
    })
    expect(chatModels.find((model) => model.id === 'custom-model')).toEqual({
      id: 'custom-model',
      providerType: 'custom',
      providerId: 'custom-provider',
      model: 'custom-model',
    })
  })

  it('should preserve custom settings on current default models', () => {
    const oldSettings = {
      version: 16,
      providers: [],
      chatModels: [
        {
          providerType: 'anthropic',
          providerId: 'anthropic',
          id: 'claude-haiku-4.5',
          model: 'claude-haiku-4-5',
          enable: false,
        },
      ],
    }

    const result = migrateFrom16To17(oldSettings)
    const chatModels = result.chatModels as { id: string; enable?: boolean }[]

    expect(chatModels.find((model) => model.id === 'claude-haiku-4.5')).toEqual(
      {
        providerType: 'anthropic',
        providerId: 'anthropic',
        id: 'claude-haiku-4.5',
        model: 'claude-haiku-4-5',
        enable: false,
      },
    )
  })
})
