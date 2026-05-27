import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class ClaimsGateway {
  @WebSocketServer() server!: Server;

  @SubscribeMessage('join-claim')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { claimId: string }) {
    client.join(`claim:${data.claimId}`);
  }

  emitStatusChanged(claimId: string, status: string) {
    this.server.to(`claim:${claimId}`).emit('status-changed', { claimId, status });
  }
}
