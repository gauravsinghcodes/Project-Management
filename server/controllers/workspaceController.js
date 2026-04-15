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
        const existingMember = await prisma.workspaceMember.findFirst({
            where: {
                userId: user.id,
                workspaceId
            }
        });
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
        const auth = await req.auth();
        const { userId } = auth;
        const { id, name, slug, image_url, ownerName, ownerEmail, ownerImage, memberRole } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!id || !name || !slug) {
            return res.status(400).json({ message: "Missing required parameters" });
        }

        const emailFromClaims = ownerEmail || auth?.sessionClaims?.email || auth?.sessionClaims?.email_address;
        const fullNameFromClaims = auth?.sessionClaims?.full_name
            || `${auth?.sessionClaims?.first_name || ""} ${auth?.sessionClaims?.last_name || ""}`.trim();
        const imageFromClaims = ownerImage || auth?.sessionClaims?.image_url || "";
        const normalizedName = ownerName || fullNameFromClaims || "Clerk User";

        // Ensure owner exists to satisfy Workspace.ownerId foreign key.
        await prisma.user.upsert({
            where: { id: userId },
            update: {
                email: emailFromClaims || `${userId}@clerk.local`,
                name: normalizedName,
                image: imageFromClaims
            },
            create: {
                id: userId,
                email: emailFromClaims || `${userId}@clerk.local`,
                name: normalizedName,
                image: imageFromClaims
            }
        });

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

        const normalizedRole = String(memberRole || "").toUpperCase().includes("ADMIN") ? "ADMIN" : "MEMBER";

        await prisma.workspaceMember.upsert({
            where: {
                userId_workspaceId: {
                    userId,
                    workspaceId: id
                }
            },
            update: { role: normalizedRole },
            create: {
                userId,
                workspaceId: id,
                role: normalizedRole
            }
        });

        res.json({ workspace, message: "Workspace synced successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message });
    }
}

// Sync an individual Clerk organization member into local DB.
export const syncWorkspaceMemberFromClerk = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { workspaceId, memberUserId, memberEmail, memberName, memberImage, memberRole } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!workspaceId || !memberUserId) {
            return res.status(400).json({ message: "Missing required parameters" });
        }

        const requesterMembership = await prisma.workspaceMember.findFirst({
            where: {
                userId,
                workspaceId
            }
        });

        if (!requesterMembership) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }

        await prisma.user.upsert({
            where: { id: memberUserId },
            update: {
                email: memberEmail || `${memberUserId}@clerk.local`,
                name: memberName || "Clerk User",
                image: memberImage || ""
            },
            create: {
                id: memberUserId,
                email: memberEmail || `${memberUserId}@clerk.local`,
                name: memberName || "Clerk User",
                image: memberImage || ""
            }
        });

        const normalizedRole = String(memberRole || "").toUpperCase().includes("ADMIN") ? "ADMIN" : "MEMBER";

        const membership = await prisma.workspaceMember.upsert({
            where: {
                userId_workspaceId: {
                    userId: memberUserId,
                    workspaceId
                }
            },
            update: {
                role: normalizedRole
            },
            create: {
                userId: memberUserId,
                workspaceId,
                role: normalizedRole
            }
        });

        res.json({ membership, message: "Workspace member synced successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.code || error.message });
    }
}


























