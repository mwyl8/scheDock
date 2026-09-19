import { z } from "zod";

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const createReservationSchema = z
  .object({
    berthId: z.string().min(1, "Pick a berth"),
    kind: z.enum(["VESSEL", "EVENT"]),
    vesselId: z.string().optional().nullable(),
    /** Optional LOA to save onto the vessel before booking (fixes missing length). */
    vesselLengthFt: z.coerce.number().int().positive().optional().nullable(),
    eventName: z.string().optional().nullable(),
    startDate: dateString,
    endDate: dateString,
    notes: z.string().optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "VESSEL" && !val.vesselId) {
      ctx.addIssue({
        code: "custom",
        message: "Select or create a vessel",
        path: ["vesselId"],
      });
    }
    if (val.kind === "EVENT" && !val.eventName?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Event name is required",
        path: ["eventName"],
      });
    }
  });

export const updateVesselLengthSchema = z.object({
  vesselId: z.string().min(1),
  lengthFt: z.coerce.number().int().positive("LOA must be a positive number of feet"),
});

export const updateReservationSchema = createReservationSchema.extend({
  id: z.string().min(1),
});

export const createVesselSchema = z.object({
  name: z.string().min(1, "Name is required"),
  typePrefix: z.string().optional().nullable(),
  lengthFt: z.coerce.number().int().positive().optional().nullable(),
  operator: z.string().optional().nullable(),
  contactNotes: z.string().optional().nullable(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type CreateVesselInput = z.infer<typeof createVesselSchema>;
