import { z } from "zod";
import { toE164Israel } from "@/lib/phone";

export const authFormSchema = z.object({
  email: z.string().trim().email("כתובת מייל לא תקינה"),
  password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "הסיסמאות אינן זהות",
    path: ["confirm"],
  });

export const emailOnlySchema = z.object({
  email: z.string().trim().email("כתובת מייל לא תקינה"),
});

export const detailsFormSchema = z.object({
  full_name: z.string().trim().min(2, "יש להזין שם מלא"),
  phone: z
    .string()
    .min(1, "יש להזין מספר טלפון")
    .refine((v) => toE164Israel(v) !== null, {
      message: "מספר טלפון לא תקין (05XXXXXXXX)",
    }),
  national_id: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "תעודת זהות צריכה להכיל 9 ספרות")
    .optional()
    .or(z.literal("")),
  profession: z.string().trim().min(2, "יש להזין תחום טיפול"),
  business_number: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "מספר עוסק/ח.פ צריך להכיל 9 ספרות")
    .optional()
    .or(z.literal("")),
});

export type DetailsFormValues = z.infer<typeof detailsFormSchema>;

export const termsFormSchema = z.object({
  accepted: z.literal(true, {
    error: "יש לאשר את תקנון השירות כדי להמשיך",
  }),
});
