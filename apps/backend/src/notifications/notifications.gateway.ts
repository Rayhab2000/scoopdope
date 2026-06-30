import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/notifications' })
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
  ) {}

  afterInit(server: Server) {
    const redisUrl = this.configService.get<string>('redis.url');
    if (!redisUrl) {
      this.logger.warn('No Redis URL configured — using in-memory adapter');
      return;
    }
    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();
    server.adapter(createAdapter(pubClient, subClient));
    this.logger.log('Redis adapter attached to Socket.IO');
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const userId = payload.sub;
      client.join(`user:${userId}`);
      
      // Send initial notifications on connect
      const notifications = await this.notificationRepo.find({
        where: { userId },
        order: { isRead: 'ASC', createdAt: 'DESC' },
      });
      client.emit('notifications:init', notifications);
      
      this.logger.debug(`Client connected: ${client.id}, user: ${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('notifications:markRead')
  async handleMarkRead(
    client: Socket,
    ids: string[],
  ): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return;

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const userId = payload.sub;
      
      // Update notifications in database
      await this.notificationRepo
        .createQueryBuilder()
        .update(Notification)
        .set({ isRead: true })
        .where('id IN (:...ids)', { ids })
        .andWhere('userId = :userId', { userId })
        .execute();
      
      // Confirm back to client
      client.emit('notifications:read', ids);
    } catch (error) {
      this.logger.error('Error marking notifications as read:', error);
    }
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
