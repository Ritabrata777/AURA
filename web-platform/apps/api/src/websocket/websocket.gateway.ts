import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  patientId?: string;
  doctorId?: string;
  rooms: Set<string>;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
  namespace: "/live",
})
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LiveGateway.name);
  private readonly patientRooms = new Map<string, Set<string>>();
  private readonly doctorRooms = new Map<string, Set<string>>();

  constructor(private readonly authService: AuthService) {}

  handleConnection(client: AuthenticatedSocket) {
    this.logger.debug(`Client connected: ${client.id}`);
    client.rooms = new Set();
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
    
    if (client.patientId) {
      const room = `patient:${client.patientId}`;
      await client.leave(room);
      this.patientRooms.get(room)?.delete(client.id);
    }
    
    if (client.doctorId) {
      const room = `doctor:${client.doctorId}`;
      await client.leave(room);
      this.doctorRooms.get(room)?.delete(client.id);
    }
  }

  @SubscribeMessage("auth")
  async handleAuth(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { token: string },
  ) {
    try {
      const user = await this.authService.validateJwt(payload.token);
      
      if (!user) {
        client.emit("auth:error", { message: "Invalid token" });
        return;
      }

      client.userId = user.id;
      this.logger.debug(`Client ${client.id} authenticated as user ${user.id} (${user.role})`);

      if (user.role === "PATIENT" && user.patient) {
        client.patientId = user.patient.id;
        const room = `patient:${user.patient.id}`;
        await client.join(room);
        
        if (!this.patientRooms.has(room)) {
          this.patientRooms.set(room, new Set());
        }
        this.patientRooms.get(room)!.add(client.id);
        
        this.logger.debug(`Client ${client.id} joined patient room ${room}`);
      }

      if (user.role === "DOCTOR" && user.doctor) {
        client.doctorId = user.doctor.id;
        const room = `doctor:${user.doctor.id}`;
        await client.join(room);
        
        if (!this.doctorRooms.has(room)) {
          this.doctorRooms.set(room, new Set());
        }
        this.doctorRooms.get(room)!.add(client.id);
        
        this.logger.debug(`Client ${client.id} joined doctor room ${room}`);
      }

      client.emit("auth:success", {
        userId: user.id,
        role: user.role,
        patientId: client.patientId,
        doctorId: client.doctorId,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Auth error: ${message}`);
      client.emit("auth:error", { message: "Authentication failed" });
    }
  }

  @SubscribeMessage("join:patient")
  async handleJoinPatientRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { patientId: string },
  ) {
    if (!client.doctorId) {
      client.emit("error", { message: "Only doctors can join patient rooms" });
      return;
    }

    const room = `patient:${payload.patientId}`;
    await client.join(room);
    
    if (!this.patientRooms.has(room)) {
      this.patientRooms.set(room, new Set());
    }
    this.patientRooms.get(room)!.add(client.id);
    
    this.logger.debug(`Doctor ${client.doctorId} joined patient room ${room}`);
  }

  emitToPatientRoom(patientId: string, event: string, data: any) {
    const room = `patient:${patientId}`;
    this.server.to(room).emit(event, data);
    this.logger.debug(`Emitted ${event} to room ${room}`);
  }

  emitToDoctorRoom(doctorId: string, event: string, data: any) {
    const room = `doctor:${doctorId}`;
    this.server.to(room).emit(event, data);
  }

  emitToPatientECG(patientId: string, sessionId: string, chunk: any) {
    this.emitToPatientRoom(patientId, "ecg:chunk", { sessionId, ...chunk });
  }

  emitToPatientMeasurement(patientId: string, measurement: any) {
    this.emitToPatientRoom(patientId, "measurement:new", measurement);
  }
}
