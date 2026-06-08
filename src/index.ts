import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';

import { env } from './config/env';
import { auth } from './config/auth';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';

const app = express();
const PORT = env.PORT;

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
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
// API ROUTES
// ---------------------------------------------------------
import { profileRoutes } from './modules/profile/profile.routes';
import { configRoutes } from './modules/config/config.routes';
import { projectRoutes } from './modules/project/project.routes';
import { taskRoutes, projectTaskRoutes } from './modules/task/task.routes';
import { teamRoutes } from './modules/team/team.routes';
import { userRoutes } from './modules/user/user.routes';
import { notificationRoutes } from './modules/notification/notification.routes';
import { commentRoutes } from './modules/comment/comment.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { activityRoutes } from './modules/activity/activity.routes';
import { searchRoutes } from './modules/search/search.routes';

app.use('/api/config', configRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/projects/:projectId/tasks', projectTaskRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks/:taskId/comments', commentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/search', searchRoutes);

// ---------------------------------------------------------
// ERROR HANDLING
// ---------------------------------------------------------
app.use(notFoundHandler);
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});