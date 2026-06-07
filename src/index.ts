import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';

import { auth } from './config/auth';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true, // Needed for Better Auth cookies
  })
);

// ---------------------------------------------------------
// BETTER AUTH
// Must be registered BEFORE express.json() to avoid body
// parser consuming the request stream first.
// Express v5 requires {*any} wildcard syntax.
// ---------------------------------------------------------
app.all('/api/auth/{*any}', toNodeHandler(auth));

app.use(express.json());

// ---------------------------------------------------------
// API ROUTES (To be implemented)
// ---------------------------------------------------------
// app.use("/api/projects", projectRoutes);
// app.use("/api/tasks", taskRoutes);

// ---------------------------------------------------------
// ERROR HANDLING
// ---------------------------------------------------------
app.use(notFoundHandler);
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});