// app/utils/validation.ts
import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(2).max(32).optional(),
});

export const SearchSchema = z.object({
  q: z.string().max(200).optional(),
  tag: z.string().max(80).optional(),
  category: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(48).optional(),
});
