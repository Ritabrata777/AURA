import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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

  async requestDoctorPatientRelationship(doctorId: string, patientId: string) {
    const existing = await this.prisma.doctorPatient.findUnique({
      where: {
        doctorId_patientId: {
          doctorId,
          patientId,
        },
      },
    });

    if (existing) {
      throw new ConflictException("Relationship already exists");
    }

    return this.prisma.doctorPatient.create({
      data: {
        doctorId,
        patientId,
        state: "PENDING",
      },
      include: {
        doctor: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
        patient: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async respondToRequest(doctorId: string, patientId: string, action: "ACCEPT" | "REJECT") {
    const relationship = await this.prisma.doctorPatient.findUnique({
      where: {
        doctorId_patientId: {
          doctorId,
          patientId,
        },
      },
    });

    if (!relationship) {
      throw new NotFoundException("Relationship request not found");
    }

    if (relationship.state !== "PENDING") {
      throw new ConflictException("Request already processed");
    }

    const newState = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";

    return this.prisma.doctorPatient.update({
      where: {
        doctorId_patientId: {
          doctorId,
          patientId,
        },
      },
      data: {
        state: newState,
      },
    });
  }

  async revokeRelationship(doctorId: string, patientId: string) {
    await this.prisma.doctorPatient.delete({
      where: {
        doctorId_patientId: {
          doctorId,
          patientId,
        },
      },
    });

    return { success: true };
  }

  async getDoctorPatients(doctorId: string, state?: string) {
    const where: any = { doctorId };
    
    if (state) {
      where.state = state;
    }

    const relationships = await this.prisma.doctorPatient.findMany({
      where,
      include: {
        patient: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    });

    return relationships.map((r: DoctorPatientWithPatient) => ({
      patientId: r.patientId,
      email: r.patient.user.email,
      state: r.state,
      createdAt: r.createdAt,
    }));
  }

  async getPatientDoctors(patientId: string, state?: string) {
    const where: any = { patientId };
    
    if (state) {
      where.state = state;
    }

    const relationships = await this.prisma.doctorPatient.findMany({
      where,
      include: {
        doctor: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
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
      where: {
        doctorId_patientId: {
          doctorId,
          patientId,
        },
      },
    });

    return relationship?.state === "ACCEPTED";
  }
}
