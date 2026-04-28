export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  pollInterval: number;
}

export interface LLMModelConfig {
  name: string;
  baseURL: string;
  apiKey: string;
}

export interface LLMConfig {
  models: LLMModelConfig[];
  prompt: string;
  maxRetries: number;
  rpm: number;
}

export interface FeishuRetryConfig {
  maxRetries: number;
  retryDelay: number;
}

export interface FeishuConfig {
  webhookUrl: string;
  mentionUserId: string;
  retry: FeishuRetryConfig;
}

export interface AppConfig {
  email: EmailConfig;
  llm: LLMConfig;
  feishu: FeishuConfig;
}

export interface EmailMessage {
  uid: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  text: string;
  html: string;
}

export interface ProcessedEmail {
  uid: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  summary: string;
  important: boolean;
}

export interface ErrorNotification {
  uid?: string;
  subject?: string;
  step: string;
  error: string;
}
