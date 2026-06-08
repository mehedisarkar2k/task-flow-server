import type { Response } from 'express';
import { catchAsync } from '../../shared/utils/catch-async';
import { sendResponse } from '../../shared/utils/send-response';
import type { TypedRequest } from '../../shared/types/typed-request';
import { runAssistant } from './assistant.service';
import type { ChatBody } from './assistant.validation';

export const chat = catchAsync(async (req: TypedRequest<ChatBody>, res: Response) => {
  const user = req.user;
  const { message, history } = req.body;

  const data = await runAssistant({
    user: user ? { id: user.id, role: user.role } : null,
    message,
    history,
  });

  sendResponse.success({ res, data });
});
