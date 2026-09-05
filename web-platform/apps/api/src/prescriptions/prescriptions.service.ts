import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrescriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DoctorsService } from "../doctors/doctors.service";

export interface MedicationInput {
  drug: string;
  dose: string;
  frequency: string;
  duration?: string;
  route?: string;
  instructions?: string;
}

export interface CreatePrescriptionInput {
  patientId: string;
  diagnosis: string;
  notes?: string;
  medications: MedicationInput[];
}

const prescriptionInclude = {
  medications: { orderBy: { createdAt: "asc" } },
  doctor: { include: { user: { select: { email: true } } } },
  patient: { include: { user: { select: { email: true } } } },
} satisfies Prisma.PrescriptionInclude;

type PrescriptionRecord = Prisma.PrescriptionGetPayload<{
  include: typeof prescriptionInclude;
}>;

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly doctorsService: DoctorsService,
  ) {}

  /**
   * Writing a prescription is the single most consequential action a clinician
   * takes in this app, so it is gated on the same ACCEPTED relationship that
   * guards every read of patient data, and the whole thing is written in one
   * transaction: a prescription with a missing drug row is worse than no
   * prescription at all.
   */
  async createPrescription(
    doctorId: string,
    createdByUserId: string,
    input: CreatePrescriptionInput,
  ): Promise<PrescriptionRecord> {
    await this.doctorsService.assertAuthorizedDoctor(doctorId, input.patientId);

    const prescription = await this.prisma.prescription.create({
      data: {
        patientId: input.patientId,
        doctorId,
        diagnosis: input.diagnosis.trim(),
        notes: input.notes?.trim() || null,
        createdById: createdByUserId,
        medications: {
          create: input.medications.map((medication) => ({
            drug: medication.drug.trim(),
            dose: medication.dose.trim(),
            frequency: medication.frequency.trim(),
            duration: medication.duration?.trim() || null,
            route: medication.route?.trim() || null,
            instructions: medication.instructions?.trim() || null,
          })),
        },
      },
      include: prescriptionInclude,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: createdByUserId,
        action: "PRESCRIPTION_CREATED",
        resource: `patient:${input.patientId}`,
        metadata: {
          doctorId,
          patientId: input.patientId,
          prescriptionId: prescription.id,
          medicationCount: prescription.medications.length,
        },
      },
    });

    return prescription;
  }

  async getPatientPrescriptions(
    patientId: string,
    options: { status?: PrescriptionStatus; limit?: number } = {},
  ): Promise<PrescriptionRecord[]> {
    return this.prisma.prescription.findMany({
      where: {
        patientId,
        ...(options.status ? { status: options.status } : {}),
      },
      include: prescriptionInclude,
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
    });
  }

  /**
   * Scoped by patient as well as id so that a doctor who guesses a
   * prescription UUID belonging to someone else's patient gets a 404 rather
   * than a record — the authorization check upstream covers the patient, this
   * makes sure the row actually belongs to them.
   */
  async getPrescriptionById(prescriptionId: string, patientId: string): Promise<PrescriptionRecord> {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, patientId },
      include: prescriptionInclude,
    });

    if (!prescription) {
      throw new NotFoundException("Prescription not found");
    }

    return prescription;
  }

  /**
   * Only the prescribing doctor may change a prescription's status. A second
   * clinician with access to the same patient still should not be able to
   * cancel a colleague's order.
   */
  async updateStatus(
    prescriptionId: string,
    doctorId: string,
    userId: string,
    status: PrescriptionStatus,
  ): Promise<PrescriptionRecord> {
    const existing = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
    });

    if (!existing) {
      throw new NotFoundException("Prescription not found");
    }

    if (existing.doctorId !== doctorId) {
      throw new ForbiddenException("Only the prescribing doctor can change this prescription");
    }

    const updated = await this.prisma.prescription.update({
      where: { id: prescriptionId },
      data: { status },
      include: prescriptionInclude,
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: `PRESCRIPTION_${status}`,
        resource: `patient:${existing.patientId}`,
        metadata: { doctorId, patientId: existing.patientId, prescriptionId, status },
      },
    });

    return updated;
  }
}
