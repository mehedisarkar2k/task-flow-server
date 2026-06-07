export interface FieldError {
  field?: string;
  message: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: FieldError[];
  public readonly instructions?: string[];

  constructor(
    message: string,
    statusCode: number,
    errors?: FieldError[],
    instructions?: string[],
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    this.instructions = instructions;

    Error.captureStackTrace(this, this.constructor);
  }
}
