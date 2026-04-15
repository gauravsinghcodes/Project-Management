import { Inngest } from 'inngest';
import prisma from "../configs/prisma.js";
import sendEmail from '../configs/nodemailer.js';

export const inngest = new Inngest({ id: "project-management" });

const ensureUserExists = async (userId, profile = {}) => {
    if (!userId) return;

    const normalizedEmail = profile.email || `${userId}@clerk.local`;
    const normalizedName = profile.name || "Clerk User";
    const normalizedImage = profile.image || "";

    await prisma.user.upsert({
        where: { id: userId },
        update: {
            email: normalizedEmail,
            name: normalizedName,
            image: normalizedImage
        },
        create: {
            id: userId,
            email: normalizedEmail,
            name: normalizedName,
            image: normalizedImage
        }
    });
};

// Inngest Function to save user data to a database
const syncUserCreation = inngest.createFunction(
    { id: 'sync-user-from-clerk', triggers: [{ event: 'clerk/user.created' }] },
    async ({ event }) => {
        const { data } = event
        await prisma.user.upsert({
            where: { id: data.id },
            update: {
                email: data?.email_addresses?.[0]?.email_address || `${data.id}@clerk.local`,
                name: `${data?.first_name || ""} ${data?.last_name || ""}`.trim() || "Clerk User",
                image: data?.image_url || ""
            },
            create: {
                id: data.id,
                email: data?.email_addresses?.[0]?.email_address || `${data.id}@clerk.local`,
                name: `${data?.first_name || ""} ${data?.last_name || ""}`.trim() || "Clerk User",
                image: data?.image_url || ""
            }
        })
    }

)

// Inngest Function to delete user from database
const syncUserDeletion = inngest.createFunction(
    { id: 'delete-user-with-clerk', triggers: [{ event: 'clerk/user.deleted' }] },
    async ({ event }) => {
        const { data } = event
        await prisma.user.delete({
            where: {
                id: data.id,
            }
        })
    }

)

// Inngest Function to update user data in database
const syncUserUpdation = inngest.createFunction(
    { id: 'update-user-from-clerk', triggers: [{ event: 'clerk/user.updated' }] },
    async ({ event }) => {
        const { data } = event
        await prisma.user.update({
            where: {
                id: data.id
            },
            data: {
                email: data?.email_addresses[0]?.email_address,
                name: data?.first_name + " " + data?.last_name,
                image: data?.image_url,
            }
        })
    }
)

// Inngest Function to save workspace data to a database
const syncWorkspaceCreation = inngest.createFunction(
    { id: 'sync-workspace-from-clerk', triggers: [{ event: 'clerk/organization.created' }] },
    async ({ event }) => {
        const { data } = event;
        await ensureUserExists(data.created_by);

        // Use upsert to be safe if organization.updated arrived first
        await prisma.workspace.upsert({
            where: { id: data.id },
            update: {
                name: data.name,
                slug: data.slug,
                image_url: data.image_url,
            },
            create: {
                id: data.id,
                name: data.name,
                slug: data.slug,
                ownerId: data.created_by,
                image_url: data.image_url,
            }
        })

        // Add creator as ADMIN member
        try {
            await prisma.workspaceMember.upsert({
                where: {
                    userId_workspaceId: {
                        userId: data.created_by,
                        workspaceId: data.id
                    }
                },
                update: { role: "ADMIN" },
                create: {
                    userId: data.created_by,
                    workspaceId: data.id,
                    role: "ADMIN"
                }
            })
        } catch (error) {
            console.log("Error syncing creator membership", error)
        }
    }
)

// Inngest Function to update workspace data in database
const syncWorkspaceUpdation = inngest.createFunction(
    { id: 'update-workspace-from-clerk', triggers: [{ event: 'clerk/organization.updated' }] },
    async ({ event }) => {
        const { data } = event;
        await ensureUserExists(data.created_by);
        await prisma.workspace.upsert({
            where: {
                id: data.id
            },
            update: {
                name: data.name,
                slug: data.slug,
                image_url: data.image_url,
            },
            create: {
                id: data.id,
                name: data.name,
                slug: data.slug,
                ownerId: data.created_by,
                image_url: data.image_url,
            }
        })
    }
)

// Inngest Function to delete workspace from database
const syncWorkspaceDeletion = inngest.createFunction(
    { id: 'delete-workspace-with-clerk', triggers: [{ event: 'clerk/organization.deleted' }] },
    async ({ event }) => {
        const { data } = event;
        try {
            await prisma.workspace.delete({
                where: {
                    id: data.id
                }
            })
        } catch (error) {
            console.log("Workspace already deleted or not found", error)
        }
    }
)

// Inngest Function to save workspace member data to a database

const syncWorkspaceMemberCreation = inngest.createFunction(
    {
        id: 'sync-workspace-member-from-clerk', triggers: [
            { event: 'clerk/organizationMembership.created' },
            { event: 'clerk/organizationInvitation.accepted' }
        ]
    },
    async ({ event }) => {
        const { data } = event;
        const userId = data.user_id || data.public_user_data?.user_id;
        const orgId = data.organization_id;
        const role = data.role || data.role_name;
        const email = data.public_user_data?.identifier;
        const fullName = `${data.public_user_data?.first_name || ""} ${data.public_user_data?.last_name || ""}`.trim();
        const image = data.public_user_data?.image_url || "";

        if (!userId || !orgId) return;
        await ensureUserExists(userId, { email, name: fullName || "Clerk User", image });

        await prisma.workspaceMember.upsert({
            where: {
                userId_workspaceId: {
                    userId: userId,
                    workspaceId: orgId
                }
            },
            update: {
                role: String(role).toUpperCase().includes("ADMIN") ? "ADMIN" : "MEMBER"
            },
            create: {
                userId: userId,
                workspaceId: orgId,
                role: String(role).toUpperCase().includes("ADMIN") ? "ADMIN" : "MEMBER"
            }
        })
    }
)

// Inngest Function to send Email on Task Creation
const sendTaskAssignmentEmail = inngest.createFunction(
    { id: "send-task-assignment-mail", triggers: [{ event: "app/task.assigned" }] },
    async ({ event, step }) => {
        const { taskId, origin } = event.data;

        const task = await step.run('fetch-task', async () => {
            return await prisma.task.findUnique({
                where: { id: taskId },
                include: { assignee: true, project: true }
            })
        })

        if (!task || !task.assignee) return;

        await step.run('send-assignment-email', async () => {
            await sendEmail({
                to: task.assignee.email,
                subject: `New Task Assignment in ${task.project.name}`,
                body: `<div style="max-width: 600px; font-family: sans-serif;">
        
                <h2>Hi ${task.assignee.name}, 👋</h2>

                <p style="font-size: 16px;">You've been assigned a new task:</p>

                <p style="font-size: 18px; font-weight: bold; color: #007bff; margin: 8px 0;">
                ${task.title}
                </p>

                <div style="border: 1px solid #ddd; padding: 12px 16px; border-radius: 6px; margin-bottom: 30px;">
        
                <p style="margin: 6px 0;">
                <strong>Description:</strong> ${task.description || "No description provided"}
                </p>

                <p style="margin: 6px 0;">
                <strong>Due Date:</strong> ${new Date(task.due_date).toLocaleDateString()}
                </p>

                </div>

                <a href="${origin}/tasks/${task.id}" 
                style="background-color: #007bff; padding: 12px 24px; border-radius: 5px; color: #fff; font-weight: 600; font-size: 16px; text-decoration: none; display: inline-block;">
                View Task
                </a>

                <p style="margin-top: 20px; font-size: 14px; color: #6c757d;">
                Please make sure to review and complete it before the due date.
                </p>

                </div>`
            })
        })

        const dueDate = new Date(task.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDateBody = new Date(task.due_date);
        dueDateBody.setHours(0, 0, 0, 0);

        if (dueDateBody.getTime() > today.getTime()) {
            await step.sleepUntil('wait-for-the-due-date', task.due_date);

            await step.run('check-if-task-is-completed', async () => {
                const refreshedTask = await prisma.task.findUnique({
                    where: { id: taskId },
                    include: { assignee: true, project: true }
                })

                if (!refreshedTask || refreshedTask.status === "DONE") return;

                await sendEmail({
                    to: refreshedTask.assignee.email,
                    subject: `Reminder for ${refreshedTask.project.name}`,
                    body: `<div style="max-width: 600px; font-family: sans-serif;">

                    <h2>Hi ${refreshedTask.assignee.name}, 👋</h2>

                    <p style="font-size: 16px;">
                    You have a task due in ${refreshedTask.project.name}:
                    </p>

                    <p style="font-size: 18px; font-weight: bold; color: #007bff; margin: 8px 0;">
                    ${refreshedTask.title}
                    </p>

                    <div style="border: 1px solid #ddd; padding: 12px 16px; border-radius: 6px; margin-bottom: 30px;">
        
                    <p style="margin: 6px 0;">
                        <strong>Description:</strong> ${refreshedTask.description || "No description provided"}
                    </p>

                    <p style="margin: 6px 0;">
                        <strong>Due Date:</strong> ${new Date(refreshedTask.due_date).toLocaleDateString()}
                        </p>

                    </div>

                    <a href="${origin}/tasks/${refreshedTask.id}" 
                    style="background-color: #007bff; padding: 12px 24px; border-radius: 5px; color: #fff; font-weight: 600; font-size: 16px; text-decoration: none; display: inline-block;">
                        View Task
                    </a>

                        <p style="margin-top: 20px; font-size: 14px; color: #6c757d;">
                    Please make sure to review and complete it before the due date.
                    </p>

                    </div>`
                })
            })
        }
    }
)


export const functions = [
    syncUserCreation,
    syncUserDeletion,
    syncUserUpdation,
    syncWorkspaceCreation,
    syncWorkspaceUpdation,
    syncWorkspaceDeletion,
    syncWorkspaceMemberCreation,
    sendTaskAssignmentEmail
];


