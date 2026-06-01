import axios from 'axios'
import type { FeishuConfig, ProcessedEmail, ErrorNotification } from './types'

export class FeishuService {
  private config: FeishuConfig

  constructor(config: FeishuConfig) {
    this.config = config
  }

  async sendEmailNotification(email: ProcessedEmail): Promise<void> {
    const content = this.buildEmailMessage(email)
    await this.sendWithRetry(content)
  }

  async sendErrorNotification(notification: ErrorNotification): Promise<void> {
    const content = this.buildErrorMessage(notification)
    await this.sendWithRetry(content)
  }

  private buildEmailMessage(email: ProcessedEmail): Record<string, unknown> {
    const headerTemplate = email.important ? 'red' : 'turquoise'
    const headerTitle = `📧：${email.subject}`

    const elements: Record<string, unknown>[] = [
      {
        tag: 'div',
        fields: [
          {
            is_short: false,
            text: { tag: 'lark_md', content: `**主题** ${email.subject}` },
          },
          {
            is_short: false,
            text: {
              tag: 'lark_md',
              content: `**时间** ${email.date.toLocaleString('zh-CN')}`,
            },
          },
          {
            is_short: false,
            text: { tag: 'lark_md', content: `**发件人** ${email.from}` },
          },
          {
            is_short: false,
            text: { tag: 'lark_md', content: `**收件人** ${email.to}` },
          },
        ],
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**📝 摘要**\n${email.summary}` },
      },
    ]

    // Add @mention for important emails
    if (email.important && this.config.mentionUserId) {
      elements.push({ tag: 'hr' })
      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `<at id=${this.config.mentionUserId}></at> 这是一封重要邮件，请及时处理`,
        },
      })
    }

    const card = {
      header: {
        title: { tag: 'plain_text', content: headerTitle },
        template: headerTemplate,
      },
      elements,
    }

    return {
      msg_type: 'interactive',
      card,
    }
  }

  private buildErrorMessage(
    notification: ErrorNotification
  ): Record<string, unknown> {
    const fields = [
      {
        is_short: true,
        text: { tag: 'lark_md', content: `**失败步骤**\n${notification.step}` },
      },
    ]

    if (notification.subject) {
      fields.push({
        is_short: true,
        text: {
          tag: 'lark_md',
          content: `**邮件主题**\n${notification.subject}`,
        },
      })
    }
    if (notification.uid) {
      fields.push({
        is_short: true,
        text: { tag: 'lark_md', content: `**UID**\n${notification.uid}` },
      })
    }

    const card = {
      header: {
        title: { tag: 'plain_text', content: '❌ 邮件处理失败' },
        template: 'red',
      },
      elements: [
        { tag: 'div', fields },
        { tag: 'hr' },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**错误信息**\n${notification.error}`,
          },
        },
      ],
    }

    return {
      msg_type: 'interactive',
      card,
    }
  }

  private async sendWithRetry(payload: Record<string, unknown>): Promise<void> {
    const { maxRetries, retryDelay } = this.config.retry
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(this.config.webhookUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 600000,
        })

        if (response.data?.code !== undefined && response.data.code !== 0) {
          throw new Error(
            `Feishu API error: ${
              response.data.msg || JSON.stringify(response.data)
            }`
          )
        }

        console.log(`[Feishu] Message sent successfully (attempt ${attempt})`)
        return
      } catch (err) {
        lastError = err as Error
        console.error(
          `[Feishu] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`
        )

        if (attempt < maxRetries) {
          await this.sleep(retryDelay)
        }
      }
    }

    throw new Error(
      `Feishu notification failed after ${maxRetries} retries: ${lastError?.message}`
    )
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
