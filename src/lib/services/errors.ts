import { Prisma } from "@/generated/prisma/client";

// Errores de servicio con código HTTP. Los traducen igual la web, las
// Server Actions y el servidor MCP — una sola taxonomía de errores.
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export class ValidationError extends ServiceError {
  constructor(message = "Datos inválidos") {
    super(message, 400, "VALIDATION");
  }
}
export class UnauthorizedError extends ServiceError {
  constructor(message = "No autenticado") {
    super(message, 401, "UNAUTHORIZED");
  }
}
export class ForbiddenError extends ServiceError {
  constructor(message = "Sin permiso para esta acción") {
    super(message, 403, "FORBIDDEN");
  }
}
export class NotFoundError extends ServiceError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "NOT_FOUND");
  }
}
export class ConflictError extends ServiceError {
  constructor(message = "Conflicto con el estado actual") {
    super(message, 409, "CONFLICT");
  }
}

// Mapea los errores conocidos de Prisma a la taxonomía de servicio.
// P2002 → 409 (unique), P2025 → 404 (no encontrado), P2003 → 400 (FK).
export function mapPrismaError(e: unknown): ServiceError {
  if (e instanceof ServiceError) return e;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case "P2002":
        return new ConflictError("Ya existe un registro con ese valor único");
      case "P2025":
        return new NotFoundError();
      case "P2003":
        return new ValidationError("Referencia inválida a otro registro");
    }
  }
  return new ServiceError("Error interno", 500, "INTERNAL");
}
