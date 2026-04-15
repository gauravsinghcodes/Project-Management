import prisma from "../configs/prisma.js";


// Get all workspaces for user
export const getUserWorkspaces = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const workspaces = await prisma.workspace.findMany({
            where: {
                members: { some: { userId: userId } }
            },
            include: {
                members: { include: { user: true } },
                projects: {
                    include: {
                        tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                        members: { include: { user: true } }
                    }
                },
                owner: true
            }
        });
        res.json({ workspaces })
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message })
    }
}


// Add member to workspace
export const addMember = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { email, role, workspaceId, message } = req.body;

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!workspaceId || !role) {
            return res.status(400).json({ message: "Missing required parameters" });
        }

        if (!["ADMIN", "MEMBER"].includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        // Fetch workspace
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, include: { members: true } })

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        // Check creater has admin role
        if (!workspace.members.find((member) => member.userId === userId && member.role === "ADMIN")) {
            return res.status(401).json({ message: "You do not have admin privileges" });
        }

        // Check if user is already a member
        const existingMember = await prisma.workspaceMember.find((member) => member.userId === user.id);
        if (existingMember) {
            return res.status(400).json({ message: "User is already a member" });
        }

        const member = await prisma.workspaceMember.create({
            data: {
                userId: user.id,
                workspaceId,
                role,
                message
            }
        })

        res.json({ member, message: "Member added successfully" });


    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message })
    }
}

// Sync Clerk organization to local workspace store.
// This avoids UI getting stuck when webhook/event sync is delayed.
export const syncWorkspaceFromClerk = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { id, name, slug, image_url } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!id || !name || !slug) {
            return res.status(400).json({ message: "Missing required parameters" });
        }

        const workspace = await prisma.workspace.upsert({
            where: { id },
            update: {
                name,
                slug,
                image_url: image_url || ""
            },
            create: {
                id,
                name,
                slug,
                ownerId: userId,
                image_url: image_url || ""
            }
        });

        await prisma.workspaceMember.upsert({
            where: {
                userId_workspaceId: {
                    userId,
                    workspaceId: id
                }
            },
            update: { role: "ADMIN" },
            create: {
                userId,
                workspaceId: id,
                role: "ADMIN"
            }
        });

        res.json({ workspace, message: "Workspace synced successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message });
    }
}


























