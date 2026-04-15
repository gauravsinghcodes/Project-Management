import express from 'express';
import { addMember, getUserWorkspaces, syncWorkspaceFromClerk, syncWorkspaceMemberFromClerk } from '../controllers/workspaceController.js';

const workspaceRouter = express.Router();

workspaceRouter.get('/', getUserWorkspaces)
workspaceRouter.post('/add-member', addMember)
workspaceRouter.post('/sync-clerk', syncWorkspaceFromClerk)
workspaceRouter.post('/sync-clerk-member', syncWorkspaceMemberFromClerk)


export default workspaceRouter;














