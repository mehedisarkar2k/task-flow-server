import { Response } from 'express';
import { HTTP_STATUS } from '../constants/http-status';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SendResponseOptions<T = undefined> {
  res: Response;
  data?: T;
  message?: string;
  meta?: PaginationMeta;
}

interface SendErrorOptions {
  res: Response;
  message?: string;
  errors?: any[];
}

export const sendResponse = {
  // ---------------------------------------------------------
  // SUCCESS RESPONSES (2xx)
  // ---------------------------------------------------------

  success: <T>({ res, data, message, meta }: SendResponseOptions<T>) => {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message,
      data,
      meta,
    });
  },

  created: <T>({ res, data, message = 'Resource created successfully' }: SendResponseOptions<T>) => {
    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message,
      data,
    });
  },

  noContent: (res: Response) => {
    return res.status(HTTP_STATUS.NO_CONTENT).send();
  },

  deleted: <T>({ res, data, message = 'Resource deleted successfully' }: SendResponseOptions<T>) => {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message,
      data,
    });
  },

  // ---------------------------------------------------------
  // ERROR RESPONSES (4xx & 5xx)
  // Note: Prefer throwing AppErrors over calling these directly
  // ---------------------------------------------------------

  badRequest: ({ res, message = 'Bad request', errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message,
      errors,
    });
  },

  unauthorized: ({ res, message = 'Not authenticated', errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message,
      errors,
    });
  },

  forbidden: ({ res, message = 'Permission denied', errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message,
      errors,
    });
  },

  notFound: ({ res, message = 'Resource not found', errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message,
      errors,
    });
  },

  conflict: ({ res, message = 'Resource already exists', errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message,
      errors,
    });
  },

  validationError: ({ res, message = 'Validation failed', errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      message,
      errors,
    });
  },

  serverError: ({ res, message = 'Internal server error', errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message,
      errors,
    });
  },
};
