import { AppError, FieldError } from './app-error';
import { HTTP_STATUS } from '../constants/http-status';

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', instructions?: string[]) {
    super(message, HTTP_STATUS.NOT_FOUND, undefined, instructions);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors?: FieldError[], instructions?: string[]) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, errors, instructions);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Not authenticated', instructions?: string[]) {
    super(message, HTTP_STATUS.UNAUTHORIZED, undefined, instructions);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Permission denied', instructions?: string[]) {
    super(message, HTTP_STATUS.FORBIDDEN, undefined, instructions);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', instructions?: string[]) {
    super(message, HTTP_STATUS.CONFLICT, undefined, instructions);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', errors?: FieldError[], instructions?: string[]) {
    super(message, HTTP_STATUS.BAD_REQUEST, errors, instructions);
  }
}
