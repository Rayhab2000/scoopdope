import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { Webhook } from './webhook.entity';
import { WebhookDelivery, DeliveryStatus } from './webhook-delivery.entity';

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [30, 60, 300, 1800, 7200]; // seconds

@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(Webhook) private webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookDelivery) private deliveryRepo: Repository<WebhookDelivery>,
  ) {}

  onModuleInit() {
    setInterval(() => this.retryPending(), 60_000);
  }

  // --- Registration ---

  async register(userId: string, url: string, events: string[]): Promise<Webhook> {
    const secret = crypto.randomBytes(32).toString('hex');
    return this.webhookRepo.save(
      this.webhookRepo.create({ userId, url, events: events.join(','), secret }),
    );
  }

  async list(userId: string): Promise<Webhook[]> {
    return this.webhookRepo.find({ where: { userId } });
  }

  async getWebhookForUser(id: string, userId: string): Promise<Webhook> {
    const wh = await this.webhookRepo.findOne({ where: { id, userId } });
    if (!wh) throw new NotFoundException('Webhook not found');
    return wh;
  }

  async delete(userId: string, id: string): Promise<void> {
    const wh = await this.webhookRepo.findOne({ where: { id, userId } });
    if (!wh) throw new NotFoundException('Webhook not found');
    await this.webhookRepo.remove(wh);
  }

  async update(userId: string, id: string, data: Partial<Pick<Webhook, 'url' | 'events' | 'isActive'>>) {
    const wh = await this.webhookRepo.findOne({ where: { id, userId } });
    if (!wh) throw new NotFoundException('Webhook not found');
    if (data.url) wh.url = data.url;
    if (data.events) wh.events = Array.isArray(data.events) ? data.events.join(',') : data.events;
    if (data.isActive !== undefined) wh.isActive = data.isActive;
    return this.webhookRepo.save(wh);
  }

  // --- Delivery queue (concurrency-limited) ---

  private readonly deliveryQueue: Array<{ wh: Webhook; delivery: WebhookDelivery }> = [];
  private draining = false;
  private readonly MAX_CONCURRENT = 5;

  private enqueue(wh: Webhook, delivery: WebhookDelivery): void {
    this.deliveryQueue.push({ wh, delivery });
    if (!this.draining) {
      this.draining = true;
      this.drainQueue();
    }
  }

  private async drainQueue(): Promise<void> {
    while (this.deliveryQueue.length > 0) {
      const batch = this.deliveryQueue.splice(0, this.MAX_CONCURRENT);
      await Promise.allSettled(
        batch.map(({ wh, delivery }) => this.deliver(wh, delivery))
      );
    }
    this.draining = false;
  }

  // --- Event publishing ---

  async publish(event: string, payload: object): Promise<void> {
    const webhooks = await this.webhookRepo
      .createQueryBuilder('w')
      .where('w.isActive = true')
      .andWhere(`w.events LIKE :event`, { event: `%${event}%` })
      .getMany();

    for (const wh of webhooks) {
      const delivery = this.deliveryRepo.create({
        webhookId: wh.id,
        event,
        payload: JSON.stringify(payload),
      });
      const saved = await this.deliveryRepo.save(delivery);
      this.enqueue(wh, saved);
    }
  }

  verifySignature(secret: string, body: string, signature: string, timestamp?: string): boolean {
    // Validate timestamp to prevent replay attacks (5 min window)
    if (timestamp) {
      const ts = parseInt(timestamp, 10);
      if (isNaN(ts)) return false;
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > 300) return false; // 5 minutes
    }

    const expected = this.sign(secret, body);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  private async deliver(wh: Webhook, delivery: WebhookDelivery): Promise<void> {
    delivery.attempts += 1;
    const body = delivery.payload;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = this.sign(wh.secret, body);

    try {
      const { status, responseBody } = await this.httpPost(wh.url, body, sig, timestamp);
      delivery.responseStatus = status;
      delivery.responseBody = responseBody.slice(0, 500);
      delivery.status = status >= 200 && status < 300 ? DeliveryStatus.SUCCESS : DeliveryStatus.FAILED;

      if (delivery.status === DeliveryStatus.FAILED && delivery.attempts < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS[delivery.attempts - 1] ?? 7200;
        delivery.nextRetryAt = new Date(Date.now() + delay * 1000);
        delivery.status = DeliveryStatus.PENDING;
      }
    } catch (err: unknown) {
      delivery.responseBody = err instanceof Error ? err.message : 'Unknown error';
      delivery.status = DeliveryStatus.FAILED;
      if (delivery.attempts < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS[delivery.attempts - 1] ?? 7200;
        delivery.nextRetryAt = new Date(Date.now() + delay * 1000);
        delivery.status = DeliveryStatus.PENDING;
      }
    }

    await this.deliveryRepo.save(delivery);
  }

  private sign(secret: string, body: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  private httpPost(url: string, body: string, signature: string, timestamp: string): Promise<{ status: number; responseBody: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'X-Webhook-Signature': signature, 
            'X-Webhook-Timestamp': timestamp,
            'Content-Length': Buffer.byteLength(body) 
          } 
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, responseBody: data }));
        },
      );
      req.on('error', reject);
      req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }

  async retryPending(): Promise<void> {
    const now = new Date();
    const pending = await this.deliveryRepo.find({
      where: [
        { status: DeliveryStatus.PENDING, nextRetryAt: LessThanOrEqual(now) },
        { status: DeliveryStatus.PENDING, nextRetryAt: IsNull() },
      ],
      take: 20,
    });

    for (const delivery of pending) {
      const wh = await this.webhookRepo.findOne({ where: { id: delivery.webhookId } });
      if (wh) await this.deliver(wh, delivery);
    }
  }

  // --- Logs ---

  getLogs(webhookId: string, userId: string) {
    return this.deliveryRepo
      .createQueryBuilder('d')
      .innerJoin(Webhook, 'w', 'w.id = d.webhookId')
      .where('d.webhookId = :webhookId', { webhookId })
      .andWhere('w.userId = :userId', { userId })
      .orderBy('d.createdAt', 'DESC')
      .limit(100)
      .getMany();
  }

  // --- Event listeners ---

  @OnEvent('enrollment.created')
  onEnrollment(payload: Record<string, unknown>) { this.publish('enrollment.created', payload); }

  @OnEvent('enrollment.completed')
  onCompletion(payload: Record<string, unknown>) { this.publish('enrollment.completed', payload); }

  @OnEvent('credential.issued')
  onCredential(payload: Record<string, unknown>) { this.publish('credential.issued', payload); }

  @OnEvent('token.rewarded')
  onTokenRewarded(payload: Record<string, unknown>) { this.publish('token.rewarded', payload); }
}
