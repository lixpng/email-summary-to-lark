import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import EventEmitter from 'events';
import type { EmailConfig, EmailMessage } from './types';

export class EmailListener extends EventEmitter {
  private config: EmailConfig;
  private client: ImapFlow | null = null;
  private seenUids: Set<string> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(config: EmailConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connectAndMarkSeen();
    console.log(`[EmailListener] Started IDLE monitoring: ${this.config.mailbox}`);
  }

  async stop(): Promise<void> {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    await this.disconnect();
    console.log('[EmailListener] Stopped');
  }

  private async connectAndMarkSeen(): Promise<void> {
    await this.connect();
    await this.markExistingAsSeen();
  }

  private async connect(): Promise<void> {
    this.client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: true,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      logger: false as any,
    });

    // ImapFlow auto-enters IDLE when idle; listen for new mail events
    this.client.on('exists', (data) => {
      console.log(`[EmailListener] New mail detected (mailbox: ${data.path})`);
      this.fetchNewEmails().catch((err) => {
        console.error('[EmailListener] Fetch after exists event failed:', (err as Error).message);
      });
    });

    this.client.on('error', (err) => {
      console.error('[EmailListener] IMAP connection error:', err.message);
    });

    this.client.on('close', () => {
      if (!this.stopped) {
        console.log('[EmailListener] Connection closed unexpectedly');
        this.client = null;
        this.scheduleReconnect();
      }
    });

    await this.client.connect();
  }

  private async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Ignore logout errors
      }
      this.client = null;
    }
  }

  private async markExistingAsSeen(): Promise<void> {
    if (!this.client) return;

    const lock = await this.client.getMailboxLock(this.config.mailbox || 'INBOX');
    try {
      for await (const msg of this.client.fetch('1:*', { uid: true })) {
        this.seenUids.add(String(msg.uid));
      }
      console.log(`[EmailListener] Marked ${this.seenUids.size} existing emails as seen`);
    } finally {
      lock.release();
    }
  }

  private async fetchNewEmails(): Promise<void> {
    if (!this.client) return;

    const lock = await this.client.getMailboxLock(this.config.mailbox || 'INBOX');
    try {
      for await (const msg of this.client.fetch('1:*', { uid: true, source: true })) {
        const uid = String(msg.uid);
        if (this.seenUids.has(uid)) continue;
        this.seenUids.add(uid);

        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          this.emit('email', {
            uid,
            subject: parsed.subject || '(No Subject)',
            from: formatAddress(parsed.from),
            to: formatAddresses(parsed.to),
            date: parsed.date || new Date(),
            text: parsed.text || '',
            html: parsed.html || '',
          } satisfies EmailMessage);
        } catch (parseErr) {
          console.error(`[EmailListener] Failed to parse uid=${uid}:`, (parseErr as Error).message);
        }
      }
    } finally {
      lock.release();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;

    const delay = this.config.pollInterval || 30000;
    console.log(`[EmailListener] Reconnecting in ${delay / 1000}s...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.stopped) return;

      try {
        await this.connect();
        console.log('[EmailListener] Reconnected successfully');
        // Fetch any emails that arrived during disconnection
        await this.fetchNewEmails();
      } catch (err) {
        console.error('[EmailListener] Reconnect failed:', (err as Error).message);
        this.scheduleReconnect();
      }
    }, delay);
  }
}

function formatAddress(addr: AddressObject | string | undefined): string {
  if (!addr) return '(Unknown)';
  if (typeof addr === 'string') return addr;
  const first = addr.value?.[0];
  if (!first) return addr.text || '(Unknown)';
  return first.name ? `${first.name} <${first.address}>` : first.address || '(Unknown)';
}

function formatAddresses(addrs: AddressObject | AddressObject[] | string | undefined): string {
  if (!addrs) return '(Unknown)';
  if (Array.isArray(addrs)) return addrs.map(a => formatAddress(a)).join(', ');
  if (typeof addrs === 'string') return addrs;
  return formatAddress(addrs);
}
