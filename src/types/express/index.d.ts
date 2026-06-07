// Augment Express Request type to include Better Auth session and user

declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
    }
  }
}

export {};
