import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { healthRoutes } from './routes/health';
import { taskRoutes } from './routes/tasks';
import { userRoutes } from './routes/users';
import { projectRoutes } from './routes/projects';
import { commentRoutes } from './routes/comments';
import { teamRoutes } from './routes/teams';
import { authMiddleware } from './middleware/auth';
import { teamGuard } from './middleware/teamGuard';
import { errorHandler } from './middleware/errorHandler';

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRoutes);

const cognitoConfigured = !!(process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID);

if (cognitoConfigured) {
  app.use('/api', authMiddleware, teamGuard);
  console.log('Auth enabled (Cognito)');
} else {
  console.log('Auth DISABLED — set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID to enable');
}

app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks/:taskId/comments', commentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/teams', teamRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

export default app;
