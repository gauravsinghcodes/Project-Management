import prisma from "../configs/prisma.js";



// Create project 
export const createProject = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { workspaceId, description, name, status, start_date, end_date, team_members, team_lead, progress, priority } = req.body;

        // Check if user has admin role for workspace
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { members: { include: { user: true } } }
        })

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        if (!workspace.members.some((member) => member.userId === userId && member.role === "ADMIN")) {
            return res.status(403).json({ message: "You dont have permission to create projects in this workspace" });
        }

        const normalizedLeadEmail = String(team_lead || "").trim().toLowerCase();
        if (!normalizedLeadEmail) {
            return res.status(400).json({ message: "Please select a valid project lead" });
        }

        // Resolve lead from current workspace members to avoid mismatches.
        const workspaceLeadMember = workspace.members.find(
            (member) => member.user?.email?.toLowerCase() === normalizedLeadEmail
        );

        if (!workspaceLeadMember) {
            return res.status(400).json({ message: "Selected project lead is not a member of this workspace. Refresh and try again." });
        }

        const project = await prisma.project.create({
            data: {
                workspaceId,
                name,
                description,
                status,
                priority,
                progress,
                team_lead: workspaceLeadMember.userId,
                start_date: start_date ? new Date(start_date) : null,
                end_date: end_date ? new Date(end_date) : null,
            }
        })

        // Add team members to project if they are in the workspace
        if (team_members?.length > 0) {
            const membersToAdd = []
            workspace.members.forEach(member => {
                if (team_members.includes(member.user.email)) {
                    membersToAdd.push(member.user.id)
                }
            })

            // Always include lead in project members list.
            if (!membersToAdd.includes(workspaceLeadMember.userId)) {
                membersToAdd.push(workspaceLeadMember.userId)
            }

            await prisma.projectMember.createMany({
                data: membersToAdd.map(memberId => ({
                    projectId: project.id,
                    userId: memberId
                })),
                skipDuplicates: true
            })
        }

        const projectWithMembers = await prisma.project.findUnique({
            where: { id: project.id },
            include: {
                members: { include: { user: true } },
                tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                owner: true
            }
        })

        res.json({ project: projectWithMembers, message: "Project created successfully" })

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.code || error.message })
    }
}

// Update project
export const updateProject = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { id, workspaceId, description, name, status, start_date, end_date, progress, priority } = req.body;

        // check if user has admin role for workspace
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { members: { include: { user: true } } }
        })

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        if (!workspace.members.some((member) => member.userId === userId && member.role === "ADMIN")) {
            const project = await prisma.project.findUnique({
                where: { id }
            })

            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            } else if (project.team_lead !== userId) {
                return res.status(403).json({ message: "You don't have permission to update projects in this workspace" });
            }
        }

        const project = await prisma.project.update({
            where: { id },
            data: {
                workspaceId,
                description,
                name,
                status,
                priority,
                progress,
                start_date: start_date ? new Date(start_date) : null,
                end_date: end_date ? new Date(end_date) : null,
            }
        })

        res.json({ project, message: "Project updated successfully" })


    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.code || error.message })
    }
}

// Add Member to project 

export const addMember = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { projectId } = req.params;
        const { email } = req.body;

        // Check if user is project lead
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                members: { include: { user: true } },
                workspace: { include: { members: true } }
            }
        })

        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        const isWorkspaceAdmin = project.workspace?.members?.some(
            (member) => member.userId === userId && member.role === "ADMIN"
        );

        if (project.team_lead !== userId && !isWorkspaceAdmin) {
            return res.status(403).json({ message: "Only project lead can add members" });
        }

        // Check if user is already a member
        const existingMember = project.members.find((member) => member.user.email === email)


        if (existingMember) {
            return res.status(400).json({ message: "User is already a member" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isWorkspaceMember = project.workspace?.members?.some((member) => member.userId === user.id);
        if (!isWorkspaceMember) {
            return res.status(400).json({ message: "User is not part of this workspace" });
        }

        const member = await prisma.projectMember.create({
            data: {
                userId: user.id,
                projectId
            }
        })

        res.json({ member, message: "Member added successfully" })

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.code || error.message })
    }
}



















