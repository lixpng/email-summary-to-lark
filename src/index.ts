import { config } from './config';
import { EmailListener } from './email';
import { Orchestrator } from './orchestrator';

async function main(): Promise<void> {
  console.log('[Main] Starting email-to-lark service...');

  const listener = new EmailListener(config.email);
  const orchestrator = new Orchestrator(config.llm, config.feishu);

  listener.on('email', (email) => {
    orchestrator.processEmail(email).catch((err) => {
      console.error('[Main] Unhandled error processing email:', (err as Error).message);
    });
  });

  listener.on('error', (err) => {
    console.error('[Main] Email listener error:', (err as Error).message);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Main] Received ${signal}, shutting down...`);
    await listener.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await listener.start();
}

main().catch((err) => {
  console.error('[Main] Fatal error:', (err as Error).message);
  process.exit(1);
});
