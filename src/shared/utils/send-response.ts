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
  instructions?: string[];
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

  badRequest: ({ res, message = 'Bad request', instructions, errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message,
      instructions,
      errors,
    });
  },

  unauthorized: ({ res, message = 'Not authenticated', instructions, errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message,
      instructions,
      errors,
    });
  },

  forbidden: ({ res, message = 'Permission denied', instructions, errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message,
      instructions,
      errors,
    });
  },

  notFound: ({ res, message = 'Resource not found', instructions, errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message,
      instructions,
      errors,
    });
  },

  conflict: ({ res, message = 'Resource already exists', instructions, errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message,
      instructions,
      errors,
    });
  },

  validationError: ({ res, message = 'Validation failed', instructions, errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      message,
      instructions,
      errors,
    });
  },

  serverError: ({ res, message = 'Internal server error', instructions, errors }: SendErrorOptions) => {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message,
      instructions,
      errors,
    });
  },
};
