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
import { DoctorsService } from "../doctors/doctors.service";
import { allowedOrigins } from "../config/cors";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  patientId?: string;
  doctorId?: string;
  /** Patient rooms this socket has been explicitly authorized to observe. */
  authorizedPatientIds?: Set<string>;
}

@WebSocketGateway({
  cors: {
    // Must use the same comma-splitting as the HTTP server, or a multi-origin
    // deployment gets working REST calls and a rejected socket handshake.
    origin: allowedOrigins(),
    credentials: true,
  },
  namespace: "/live",
})
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(LiveGateway.name);

  /** Sockets that connected but never authenticated, with their kill timers. */
  private readonly pendingAuth = new Map<string, NodeJS.Timeout>();
  private static readonly AUTH_GRACE_MS = 10_000;

  constructor(
    private readonly authService: AuthService,
    private readonly doctorsService: DoctorsService,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    this.logger.debug(`Client connected: ${client.id}`);
    client.authorizedPatientIds = new Set();

    // An unauthenticated socket is just an open file descriptor. Drop it if no
    // valid token arrives shortly, so anonymous clients cannot accumulate.
    const timer = setTimeout(() => {
      if (!client.userId) {
        this.logger.debug(`Disconnecting ${client.id}: no authentication`);
        client.emit("auth:error", { message: "Authentication timed out" });
        client.disconnect(true);
      }
      this.pendingAuth.delete(client.id);
    }, LiveGateway.AUTH_GRACE_MS);

    this.pendingAuth.set(client.id, timer);
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`Client disconnected: ${client.id}`);

    const timer = this.pendingAuth.get(client.id);
    if (timer) {
      clearTimeout(timer);
      this.pendingAuth.delete(client.id);
    }

    // socket.io removes a disconnecting socket from its rooms automatically;
    // the previous manual bookkeeping duplicated that and leaked entries for
    // rooms joined via `join:patient`.
    client.authorizedPatientIds?.clear();
  }

  @SubscribeMessage("auth")
  async handleAuth(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { token?: string } | undefined,
  ) {
    try {
      if (!payload?.token || typeof payload.token !== "string") {
        client.emit("auth:error", { message: "Missing token" });
        return;
      }

      const user = await this.authService.validateJwt(payload.token);

      if (!user) {
        client.emit("auth:error", { message: "Invalid token" });
        return;
      }

      const timer = this.pendingAuth.get(client.id);
      if (timer) {
        clearTimeout(timer);
        this.pendingAuth.delete(client.id);
      }

      client.userId = user.id;
      this.logger.debug(`Client ${client.id} authenticated as user ${user.id} (${user.role})`);

      if (user.role === "PATIENT" && user.patient) {
        client.patientId = user.patient.id;
        client.authorizedPatientIds?.add(user.patient.id);
        await client.join(`patient:${user.patient.id}`);
      }

      if (user.role === "INDIVIDUAL_USER" && user.individualUser) {
        // The ingestion service emits wellness-device events into
        // `patient:<individualUserId>`. Without joining that room here the
        // events were broadcast to a name no socket ever held.
        await client.join(`patient:${user.individualUser.id}`);
      }

      if (user.role === "DOCTOR" && user.doctor) {
        client.doctorId = user.doctor.id;
        await client.join(`doctor:${user.doctor.id}`);
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

  /**
   * Subscribes a doctor to a patient's live vitals stream.
   *
   * This previously checked only that the socket belonged to *some* doctor,
   * then joined whatever patient room was named — so any authenticated doctor
   * could stream any patient's ECG and vitals in real time. Access now
   * requires an ACCEPTED DoctorPatient relationship, and every subscription is
   * written to the audit log.
   */
  @SubscribeMessage("join:patient")
  async handleJoinPatientRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { patientId?: string } | undefined,
  ) {
    if (!client.userId) {
      client.emit("error", { message: "Not authenticated" });
      return;
    }

    if (!client.doctorId) {
      client.emit("error", { message: "Only doctors can join patient rooms" });
      return;
    }

    const patientId = payload?.patientId;
    if (!patientId || typeof patientId !== "string") {
      client.emit("error", { message: "patientId is required" });
      return;
    }

    const authorized = await this.doctorsService.isAuthorizedDoctor(client.doctorId, patientId);

    if (!authorized) {
      this.logger.warn(
        `Doctor ${client.doctorId} denied access to patient ${patientId} (no accepted relationship)`,
      );
      client.emit("error", { message: "No accepted relationship with this patient" });
      return;
    }

    const room = `patient:${patientId}`;
    await client.join(room);
    client.authorizedPatientIds?.add(patientId);

    this.logger.debug(`Doctor ${client.doctorId} joined patient room ${room}`);
    client.emit("join:patient:success", { patientId });
  }

  @SubscribeMessage("leave:patient")
  async handleLeavePatientRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { patientId?: string } | undefined,
  ) {
    const patientId = payload?.patientId;
    if (!patientId || patientId === client.patientId) {
      return;
    }

    await client.leave(`patient:${patientId}`);
    client.authorizedPatientIds?.delete(patientId);
  }

  emitToPatientRoom(patientId: string, event: string, data: unknown) {
    this.server?.to(`patient:${patientId}`).emit(event, data);
  }

  emitToDoctorRoom(doctorId: string, event: string, data: unknown) {
    this.server?.to(`doctor:${doctorId}`).emit(event, data);
  }
}
