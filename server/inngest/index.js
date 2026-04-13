import { Inngest } from 'inngest';
import prisma from "../configs/prisma.js";

export const inngest = new Inngest({ id: "project-management" });

// Inngest Function to save user data to a database
const syncUserCreation = inngest.createFunction(
    { id: 'sync-user-from-clerk', triggers: [{ event: 'clerk/user.created' }] },
    async ({ event }) => {
        const { data } = event
        await prisma.user.create({
            data: {
                id: data.id,
                email: data?.email_addresses[0]?.email_address,
                name: data?.first_name + " " + data?.last_name,
                image: data?.image_url,
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
    { id: 'sync-workspace-member-from-clerk', triggers: [
        { event: 'clerk/organizationMembership.created' },
        { event: 'clerk/organizationInvitation.accepted' }
    ] },
    async ({ event }) => {
        const { data } = event;
        const userId = data.user_id || data.public_user_data?.user_id;
        const orgId = data.organization_id;
        const role = data.role || data.role_name;

        if(!userId || !orgId) return;

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




export const functions = [
    syncUserCreation,
    syncUserDeletion,
    syncUserUpdation,
    syncWorkspaceCreation,
    syncWorkspaceUpdation,
    syncWorkspaceDeletion,
    syncWorkspaceMemberCreation
];


