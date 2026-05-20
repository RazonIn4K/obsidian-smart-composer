import { App } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import { AbstractJsonRepository } from '../base'
import { CHAT_DIR, ROOT_DIR } from '../constants'
import { EmptyChatTitleException } from '../exception'

import {
  CHAT_SCHEMA_VERSION,
  ChatConversation,
  ChatConversationMetadata,
} from './types'

export class ChatManager extends AbstractJsonRepository<
  ChatConversation,
  ChatConversationMetadata
> {
  constructor(app: App) {
    super(app, `${ROOT_DIR}/${CHAT_DIR}`)
  }

  protected generateFileName(chat: ChatConversation): string {
    // Format: v{schemaVersion}_{updatedAt}_{id}.json
    return `v${chat.schemaVersion}_${chat.updatedAt}_${chat.id}.json`
  }

  protected parseFileName(fileName: string): ChatConversationMetadata | null {
    const newFormatMatch = fileName.match(
      new RegExp(`^v${CHAT_SCHEMA_VERSION}_(\\d+)_([0-9a-fA-F-]+)\\.json$`),
    )
    if (newFormatMatch) {
      return {
        id: newFormatMatch[2],
        schemaVersion: CHAT_SCHEMA_VERSION,
        title: '',
        updatedAt: parseInt(newFormatMatch[1], 10),
      }
    }

    // Legacy format: v{schemaVersion}_{encodedTitle}_{updatedAt}_{id}.json
    const legacyFormatMatch = fileName.match(
      new RegExp(
        `^v${CHAT_SCHEMA_VERSION}_(.+)_(\\d+)_([0-9a-fA-F-]+)\\.json$`,
      ),
    )
    if (!legacyFormatMatch) return null

    let title: string
    try {
      title = decodeURIComponent(legacyFormatMatch[1])
    } catch (error) {
      console.warn(`Failed to parse legacy chat filename: ${fileName}`, error)
      return null
    }

    return {
      id: legacyFormatMatch[3],
      schemaVersion: CHAT_SCHEMA_VERSION,
      title,
      updatedAt: parseInt(legacyFormatMatch[2], 10),
    }
  }

  public async createChat(
    initialData: Partial<ChatConversation>,
  ): Promise<ChatConversation> {
    if (initialData.title && initialData.title.length === 0) {
      throw new EmptyChatTitleException()
    }

    const now = Date.now()
    const newChat: ChatConversation = {
      id: uuidv4(),
      title: 'New chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: CHAT_SCHEMA_VERSION,
      ...initialData,
    }

    await this.create(newChat)
    return newChat
  }

  public async findById(id: string): Promise<ChatConversation | null> {
    const allMetadata = await this.listMetadata()
    const targetMetadata = allMetadata
      .filter((meta) => meta.id === id)
      .sort((a, b) => b.updatedAt - a.updatedAt)

    for (const metadata of targetMetadata) {
      const chat = await this.read(metadata.fileName)
      if (chat) return chat
    }
    return null
  }

  public async updateChat(
    id: string,
    updates: Partial<
      Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
    >,
  ): Promise<ChatConversation | null> {
    const chat = await this.findById(id)
    if (!chat) return null

    if (updates.title !== undefined && updates.title.length === 0) {
      throw new EmptyChatTitleException()
    }

    const updatedChat: ChatConversation = {
      ...chat,
      ...updates,
      updatedAt: Date.now(),
    }

    await this.update(chat, updatedChat)
    return updatedChat
  }

  public async deleteChat(id: string): Promise<boolean> {
    const allMetadata = await this.listMetadata()
    const targetMetadata = allMetadata.filter((meta) => meta.id === id)
    if (targetMetadata.length === 0) return false

    const results = await Promise.all(
      targetMetadata.map((metadata) => this.delete(metadata.fileName)),
    )
    return results.some(Boolean)
  }

  public async listChats(): Promise<ChatConversationMetadata[]> {
    const metadata = await this.listMetadata()
    const chats = await Promise.all(
      metadata.map(async (item) => {
        const chat = await this.read(item.fileName)
        if (!chat) return null

        return {
          id: chat.id ?? item.id,
          schemaVersion: chat.schemaVersion ?? item.schemaVersion,
          title: chat.title ?? item.title,
          updatedAt: chat.updatedAt ?? item.updatedAt,
        }
      }),
    )

    const latestMetadataById = new Map<string, ChatConversationMetadata>()
    chats.forEach((chat) => {
      if (!chat) return
      const existing = latestMetadataById.get(chat.id)
      if (!existing || chat.updatedAt > existing.updatedAt) {
        latestMetadataById.set(chat.id, chat)
      }
    })

    return [...latestMetadataById.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )
  }
}
