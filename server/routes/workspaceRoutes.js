import express from 'express';
import { addMember, getUserWorkspaces, syncWorkspaceFromClerk } from '../controllers/workspaceController.js';

const workspaceRouter = express.Router();

workspaceRouter.get('/', getUserWorkspaces)
workspaceRouter.post('/add-member', addMember)
workspaceRouter.post('/sync-clerk', syncWorkspaceFromClerk)


export default workspaceRouter;














