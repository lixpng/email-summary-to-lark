import type { EmailMessage, ProcessedEmail, ErrorNotification } from './types'
import { LLMService } from './llm'
import { FeishuService } from './feishu'
import type { LLMConfig, FeishuConfig } from './types'

export class Orchestrator {
  private llm: LLMService
  private feishu: FeishuService

  constructor(llmConfig: LLMConfig, feishuConfig: FeishuConfig) {
    this.llm = new LLMService(llmConfig)
    this.feishu = new FeishuService(feishuConfig)
  }

  async processEmail(email: EmailMessage): Promise<void> {
    console.log(
      `[Orchestrator] Processing email: "${email.subject}" (uid=${email.uid})`
    )

    let summary = ''

    // Step 1: Summarize (in Chinese)
    let important = false
    try {
      const content = this.extractContent(email)
      if (!content.trim()) {
        summary = '(邮件无文本内容)'
      } else {
        const raw = await this.llm.summarize(content)
        const parsed = this.parseLLMResponse(raw)
        summary = parsed.summary
        important = parsed.important
      }
    } catch (err) {
      const detail = this.extractErrorDetail(err)
      console.error(
        `[Orchestrator] LLM call failed for uid=${email.uid}:`,
        detail
      )
      await this.notifyError({
        uid: email.uid,
        subject: email.subject,
        step: 'LLM 摘要',
        error: detail,
      })
      return
    }

    // Step 2: Send to Feishu
    const processed: ProcessedEmail = {
      uid: email.uid,
      subject: email.subject,
      from: email.from,
      to: email.to,
      date: email.date,
      summary,
      important,
    }

    try {
      await this.feishu.sendEmailNotification(processed)
    } catch (err) {
      const detail = this.extractErrorDetail(err)
      console.error(
        `[Orchestrator] Feishu notification failed for uid=${email.uid}:`,
        detail
      )
      await this.notifyError({
        uid: email.uid,
        subject: email.subject,
        step: '飞书通知',
        error: detail,
      })
    }
  }

  private extractContent(email: EmailMessage): string {
    // Prefer plain text over HTML
    let content = email.text || ''

    if (!content.trim() && email.html) {
      content = this.stripHtml(email.html)
    }

    // Remove invisible characters and zero-width spaces
    content = content.replace(
      /[\u200b-\u200f\u2028-\u202f\u205f-\u206f\u00ad\u034f\u061c\ufeff]/g,
      ''
    )
    // Collapse whitespace
    content = content.replace(/\s+/g, ' ').trim()

    // Truncate to avoid token limit issues
    const MAX_CHARS = 10000
    if (content.length > MAX_CHARS) {
      content = content.substring(0, MAX_CHARS) + '...(内容已截断)'
    }

    return content
  }

  private parseLLMResponse(raw: string): { summary: string; important: boolean } {
    try {
      // Try to extract JSON from the response (model may wrap it in markdown)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          summary: parsed.summary || raw,
          important: parsed.important === true,
        }
      }
    } catch {
      // JSON parse failed
    }
    // Fallback: treat whole response as summary
    return { summary: raw, important: false }
  }

  private stripHtml(html: string): string {
    return (
      html
        // Remove style/script blocks entirely
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        // Remove HTML tags
        .replace(/<[^>]*>/g, ' ')
        // Decode common HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Remove known tracking redirect URLs (keep meaningful links)
        .replace(/https?:\/\/click\.\S+/gi, '')
        .replace(/https?:\/\/\S+\/CL0\/\S+/gi, '')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim()
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractErrorDetail(err: any): string {
    // Log full error structure for debugging
    console.error('[Orchestrator] Full error:', JSON.stringify(err, null, 2))

    // OpenAI SDK: err.error.message contains the API error detail
    if (err?.error?.message)
      return `${err.status || ''} ${err.error.message}`.trim()
    // Fallback: err.message (e.g. "400 status code (no body)")
    if (err?.message) return err.message
    return String(err)
  }

  private async notifyError(notification: ErrorNotification): Promise<void> {
    try {
      await this.feishu.sendErrorNotification(notification)
    } catch (err) {
      const error = err as Error
      console.error(
        `[Orchestrator] Failed to send error notification:`,
        error.message
      )
    }
  }
}
