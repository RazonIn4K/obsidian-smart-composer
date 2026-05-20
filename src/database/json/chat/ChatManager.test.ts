import { App } from 'obsidian'

import { ChatManager } from './ChatManager'
import { CHAT_SCHEMA_VERSION, ChatConversation } from './types'

const CHAT_DIR = '.smtcmp_json_db/chats'

const mockAdapter = {
  exists: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
  read: jest.fn(),
  write: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn(),
  list: jest.fn(),
}

const mockVault = {
  adapter: mockAdapter,
}

const mockApp = {
  vault: mockVault,
} as unknown as App

type ExposedChatManager = ChatManager & {
  generateFileName: (chat: ChatConversation) => string
  parseFileName: (fileName: string) => {
    id: string
    title: string
    updatedAt: number
    schemaVersion: number
  } | null
}

type FileValue = ChatConversation | string | Error

function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

function createChat(
  overrides: Partial<ChatConversation> = {},
): ChatConversation {
  const now = 1620000000000
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Test chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: CHAT_SCHEMA_VERSION,
    ...overrides,
  }
}

function enoentError(message = 'ENOENT: no such file or directory'): Error {
  const error = new Error(message) as Error & { code: string }
  error.code = 'ENOENT'
  return error
}

function setupFiles(files: Record<string, FileValue>): void {
  const fileNames = new Set(Object.keys(files))
  const hasFile = (fileName: string): boolean => fileNames.has(fileName)

  mockAdapter.list.mockResolvedValue({
    files: Object.keys(files).map((fileName) => `${CHAT_DIR}/${fileName}`),
    folders: [],
  })
  mockAdapter.exists.mockImplementation(async (filePath: string) => {
    if (filePath === CHAT_DIR) return true
    return hasFile(basename(filePath))
  })
  mockAdapter.read.mockImplementation(async (filePath: string) => {
    const value = files[basename(filePath)]
    if (value instanceof Error) throw value
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  })
  mockAdapter.remove.mockImplementation(async (filePath: string) => {
    const fileName = basename(filePath)
    if (!hasFile(fileName)) {
      throw enoentError()
    }
    Reflect.deleteProperty(files, fileName)
    fileNames.delete(fileName)
  })
}

describe('ChatManager', () => {
  let chatManager: ChatManager
  let exposedChatManager: ExposedChatManager
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockAdapter.exists.mockResolvedValue(true)
    mockAdapter.list.mockResolvedValue({ files: [], folders: [] })
    mockAdapter.read.mockResolvedValue('')
    mockAdapter.remove.mockResolvedValue(undefined)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    chatManager = new ChatManager(mockApp)
    exposedChatManager = chatManager as ExposedChatManager
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  describe('filename generation and parsing', () => {
    it('generates title-free filenames for new chats', () => {
      const chat = createChat({
        title: 'Long title with / slashes and encoded %20 characters',
      })

      const fileName = exposedChatManager.generateFileName(chat)
      const metadata = exposedChatManager.parseFileName(fileName)

      expect(fileName).toBe(
        `v${CHAT_SCHEMA_VERSION}_${chat.updatedAt}_${chat.id}.json`,
      )
      expect(fileName).not.toContain(encodeURIComponent(chat.title))
      expect(metadata).toEqual({
        id: chat.id,
        schemaVersion: CHAT_SCHEMA_VERSION,
        title: '',
        updatedAt: chat.updatedAt,
      })
    })

    it('parses legacy title-derived filenames', () => {
      const chat = createChat({
        title: 'Legacy title with / slashes and Unicode 中文',
      })
      const fileName = `v${CHAT_SCHEMA_VERSION}_${encodeURIComponent(
        chat.title,
      )}_${chat.updatedAt}_${chat.id}.json`

      const metadata = exposedChatManager.parseFileName(fileName)

      expect(metadata).toEqual({
        id: chat.id,
        schemaVersion: CHAT_SCHEMA_VERSION,
        title: chat.title,
        updatedAt: chat.updatedAt,
      })
    })

    it('keeps long prompt filenames short and safe', () => {
      const chat = createChat({
        title: 'A'.repeat(2000),
      })

      const fileName = exposedChatManager.generateFileName(chat)

      expect(fileName).toBe(
        `v${CHAT_SCHEMA_VERSION}_${chat.updatedAt}_${chat.id}.json`,
      )
      expect(fileName.length).toBeLessThan(80)
    })
  })

  describe('read/list/find resilience', () => {
    it('skips ENOENT files when listing chats', async () => {
      const chat = createChat({ title: 'Readable chat' })
      const readableFileName = exposedChatManager.generateFileName(chat)
      const missingFileName = `v${CHAT_SCHEMA_VERSION}_1620000001000_123e4567-e89b-12d3-a456-426614174001.json`
      setupFiles({
        [readableFileName]: chat,
        [missingFileName]: enoentError(),
      })

      const chats = await chatManager.listChats()

      expect(chats).toEqual([
        {
          id: chat.id,
          schemaVersion: chat.schemaVersion,
          title: chat.title,
          updatedAt: chat.updatedAt,
        },
      ])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('surfaces non-ENOENT read errors when listing chats', async () => {
      const chat = createChat()
      const fileName = exposedChatManager.generateFileName(chat)
      const error = new Error('EACCES: permission denied')
      setupFiles({
        [fileName]: error,
      })

      await expect(chatManager.listChats()).rejects.toThrow(
        'EACCES: permission denied',
      )
    })

    it('deduplicates chats by id using the newest file contents', async () => {
      const olderChat = createChat({
        title: 'Older title',
        updatedAt: 1620000000000,
      })
      const newerChat = createChat({
        title: 'Newer title',
        updatedAt: 1620000001000,
      })
      setupFiles({
        [exposedChatManager.generateFileName(olderChat)]: olderChat,
        [exposedChatManager.generateFileName(newerChat)]: newerChat,
      })

      const chats = await chatManager.listChats()

      expect(chats).toEqual([
        {
          id: newerChat.id,
          schemaVersion: newerChat.schemaVersion,
          title: newerChat.title,
          updatedAt: newerChat.updatedAt,
        },
      ])
    })

    it('falls back to an older duplicate when the newest matching file disappears', async () => {
      const olderChat = createChat({
        title: 'Older title',
        updatedAt: 1620000000000,
      })
      const newerChat = createChat({
        title: 'Newer title',
        updatedAt: 1620000001000,
      })
      setupFiles({
        [exposedChatManager.generateFileName(olderChat)]: olderChat,
        [exposedChatManager.generateFileName(newerChat)]: enoentError(),
      })

      const chat = await chatManager.findById(olderChat.id)

      expect(chat).toEqual(olderChat)
      expect(warnSpy).toHaveBeenCalled()
    })
  })

  describe('deleteChat', () => {
    it('deletes all files matching the requested chat id', async () => {
      const chat = createChat({ title: 'Current title' })
      const legacyChat = createChat({
        title: 'Legacy title',
        updatedAt: chat.updatedAt - 1,
      })
      const currentFileName = exposedChatManager.generateFileName(chat)
      const legacyFileName = `v${CHAT_SCHEMA_VERSION}_${encodeURIComponent(
        legacyChat.title,
      )}_${legacyChat.updatedAt}_${legacyChat.id}.json`
      setupFiles({
        [currentFileName]: chat,
        [legacyFileName]: legacyChat,
      })

      const deleted = await chatManager.deleteChat(chat.id)

      expect(deleted).toBe(true)
      expect(mockAdapter.remove).toHaveBeenCalledTimes(2)
      expect(mockAdapter.remove).toHaveBeenCalledWith(
        `${CHAT_DIR}/${currentFileName}`,
      )
      expect(mockAdapter.remove).toHaveBeenCalledWith(
        `${CHAT_DIR}/${legacyFileName}`,
      )
    })
  })
})
