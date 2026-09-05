import { Injectable, NotFoundException, ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma, RelationshipState } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type DoctorPatientWithPatient = Prisma.DoctorPatientGetPayload<{
  include: { patient: { include: { user: { select: { email: true } } } } };
}>;

type DoctorPatientWithDoctor = Prisma.DoctorPatientGetPayload<{
  include: { doctor: { include: { user: { select: { email: true } } } } };
}>;

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a patient by the email address on their user account and then
   * files the normal access request.
   *
   * Deliberately does not expose a general "look up a patient" endpoint: this
   * confirms an exact address the clinician already has, and the patient still
   * has to approve before any health data is shared.
   */
  async requestRelationshipByPatientEmail(doctorId: string, email: string) {
    const normalized = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { patient: true },
    });

    if (!user?.patient) {
      throw new NotFoundException("No patient account with that email address");
    }

    return this.requestDoctorPatientRelationship(doctorId, user.patient.id);
  }

  async requestDoctorPatientRelationship(doctorId: string, patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }

    const existing = await this.prisma.doctorPatient.findUnique({
      where: { doctorId_patientId: { doctorId, patientId } },
    });

    if (existing) {
      // A previously rejected or revoked relationship should be re-requestable;
      // only a live PENDING/ACCEPTED link is a genuine conflict. Without this
      // a single rejection permanently locked the pair out of ever connecting.
      if (existing.state === "PENDING" || existing.state === "ACCEPTED") {
        throw new ConflictException(`Relationship already ${existing.state.toLowerCase()}`);
      }

      return this.prisma.doctorPatient.update({
        where: { doctorId_patientId: { doctorId, patientId } },
        data: { state: "PENDING" },
      });
    }

    return this.prisma.doctorPatient.create({
      data: {
        doctorId,
        patientId,
        state: "PENDING",
      },
      include: {
        doctor: { include: { user: { select: { email: true } } } },
        patient: { include: { user: { select: { email: true } } } },
      },
    });
  }

  /**
   * Called on behalf of the *patient*, who is the only party entitled to grant
   * a doctor access to their health record.
   */
  async respondToRequest(doctorId: string, patientId: string, action: "ACCEPT" | "REJECT") {
    const relationship = await this.prisma.doctorPatient.findUnique({
      where: { doctorId_patientId: { doctorId, patientId } },
    });

    if (!relationship) {
      throw new NotFoundException("Relationship request not found");
    }

    if (relationship.state !== "PENDING") {
      throw new ConflictException("Request already processed");
    }

    const newState: RelationshipState = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";

    const updated = await this.prisma.doctorPatient.update({
      where: { doctorId_patientId: { doctorId, patientId } },
      data: { state: newState },
    });

    await this.prisma.auditLog.create({
      data: {
        action: `RELATIONSHIP_${newState}`,
        resource: `patient:${patientId}`,
        metadata: { doctorId, patientId, decidedBy: "PATIENT" },
      },
    });

    return updated;
  }

  /**
   * Marks the relationship REVOKED instead of deleting it. Consent history for
   * health data is exactly the kind of record an audit needs to reconstruct,
   * and a hard delete also orphaned nothing but erased the evidence.
   */
  async revokeRelationship(doctorId: string, patientId: string, revokedBy: "DOCTOR" | "PATIENT") {
    const relationship = await this.prisma.doctorPatient.findUnique({
      where: { doctorId_patientId: { doctorId, patientId } },
    });

    if (!relationship) {
      throw new NotFoundException("Relationship not found");
    }

    await this.prisma.doctorPatient.update({
      where: { doctorId_patientId: { doctorId, patientId } },
      data: { state: "REVOKED" },
    });

    await this.prisma.auditLog.create({
      data: {
        action: "RELATIONSHIP_REVOKED",
        resource: `patient:${patientId}`,
        metadata: { doctorId, patientId, revokedBy },
      },
    });

    return { success: true };
  }

  async getDoctorPatients(doctorId: string, state?: string) {
    const where: Prisma.DoctorPatientWhereInput = { doctorId };

    if (state) {
      where.state = state as RelationshipState;
    }

    const relationships = await this.prisma.doctorPatient.findMany({
      where,
      include: {
        patient: { include: { user: { select: { email: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return relationships.map((r: DoctorPatientWithPatient) => ({
      patientId: r.patientId,
      email: r.patient.user.email,
      state: r.state,
      createdAt: r.createdAt,
    }));
  }

  async getPatientDoctors(patientId: string, state?: string) {
    const where: Prisma.DoctorPatientWhereInput = { patientId };

    if (state) {
      where.state = state as RelationshipState;
    }

    const relationships = await this.prisma.doctorPatient.findMany({
      where,
      include: {
        doctor: { include: { user: { select: { email: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return relationships.map((r: DoctorPatientWithDoctor) => ({
      doctorId: r.doctorId,
      email: r.doctor.user.email,
      state: r.state,
      createdAt: r.createdAt,
    }));
  }

  async getPendingRequestsForDoctor(doctorId: string) {
    return this.getDoctorPatients(doctorId, "PENDING");
  }

  async getPendingRequestsForPatient(patientId: string) {
    return this.getPatientDoctors(patientId, "PENDING");
  }

  async isAuthorizedDoctor(doctorId: string, patientId: string): Promise<boolean> {
    const relationship = await this.prisma.doctorPatient.findUnique({
      where: { doctorId_patientId: { doctorId, patientId } },
    });

    return relationship?.state === "ACCEPTED";
  }

  /**
   * Single gate for every doctor-initiated read of patient health data. Throws
   * rather than returning a boolean so a forgotten `if` cannot silently leak.
   */
  async assertAuthorizedDoctor(doctorId: string, patientId: string): Promise<void> {
    const authorized = await this.isAuthorizedDoctor(doctorId, patientId);
    if (!authorized) {
      throw new ForbiddenException("No accepted relationship with this patient");
    }
  }
}
