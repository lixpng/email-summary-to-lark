import axios from 'axios'
import type { LLMConfig, LLMModelConfig } from './types'

interface QueueItem {
  execute: () => Promise<string>
  resolve: (value: string) => void
  reject: (reason: unknown) => void
}

export class LLMService {
  private config: LLMConfig
  private currentModelIndex = 0
  private queue: QueueItem[] = []
  private processing = false
  private requestTimestamps: number[] = []

  constructor(config: LLMConfig) {
    this.config = config
  }

  async summarize(content: string): Promise<string> {
    const prompt = this.config.prompt.replace('{content}', content)
    return this.enqueue(() => this.callWithRetry(prompt))
  }

  private enqueue(execute: () => Promise<string>): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ execute, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true

    while (this.queue.length > 0) {
      await this.waitForRpmLimit()

      const item = this.queue.shift()
      if (!item) break

      try {
        const result = await item.execute()
        item.resolve(result)
      } catch (err) {
        item.reject(err)
      }
    }

    this.processing = false
  }

  private async waitForRpmLimit(): Promise<void> {
    const now = Date.now()
    const windowMs = 60000

    // Clean up timestamps older than 1 minute
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < windowMs)

    if (this.requestTimestamps.length >= this.config.rpm) {
      // Wait until the oldest request is outside the window
      const oldestInWindow = this.requestTimestamps[0]
      const waitMs = oldestInWindow + windowMs - now + 100 // +100ms buffer
      if (waitMs > 0) {
        console.log(`[LLM] RPM limit reached, waiting ${Math.ceil(waitMs / 1000)}s...`)
        await this.sleep(waitMs)
      }
    }

    this.requestTimestamps.push(Date.now())
  }

  private async callWithRetry(prompt: string): Promise<string> {
    const maxRetries = this.config.maxRetries
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Try from current model, fallback to next on failure
      for (let modelOffset = 0; modelOffset < this.config.models.length; modelOffset++) {
        const modelIndex = (this.currentModelIndex + modelOffset) % this.config.models.length
        const model = this.config.models[modelIndex]

        try {
          const result = await this.callModel(model, prompt)
          // Success: update current model
          if (modelIndex !== this.currentModelIndex) {
            console.log(`[LLM] Switched to model: ${model.name}`)
            this.currentModelIndex = modelIndex
          }
          return result
        } catch (err) {
          const detail = this.extractErrorDetail(err)
          console.error(`[LLM] Model ${model.name} failed: ${detail}`)
          lastError = err instanceof Error ? err : new Error(String(err))
        }
      }

      // All models failed for this attempt
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000) // exponential backoff, max 30s
        console.log(`[LLM] All models failed (attempt ${attempt}/${maxRetries}), retrying in ${delay / 1000}s...`)
        await this.sleep(delay)
      }
    }

    throw lastError || new Error('LLM call failed after all retries')
  }

  private async callModel(model: LLMModelConfig, prompt: string): Promise<string> {
    const url = `${model.baseURL.replace(/\/+$/, '')}/chat/completions`
    try {
      const response = await axios.post(
        url,
        {
          model: model.name,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          timeout: 600000,
        }
      )

      const content = response.data?.choices?.[0]?.message?.content
      if (!content) {
        throw new Error(`LLM returned empty response: ${JSON.stringify(response.data)}`)
      }
      return content.trim()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const detail = JSON.stringify(err.response.data)
        throw new Error(`${err.response.status} ${detail}`)
      }
      throw err
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractErrorDetail(err: any): string {
    if (err?.message) return err.message
    return String(err)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
