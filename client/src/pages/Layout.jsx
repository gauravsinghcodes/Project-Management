import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { Outlet } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { loadTheme } from '../features/themeSlice'
import { Loader2Icon } from 'lucide-react'
import { useUser, SignIn, useAuth, CreateOrganization, useOrganizationList } from '@clerk/react'
import { fetchWorkspaces } from '../features/workspaceSlice'
import api from '../../configs/api'

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const { loading, workspaces } = useSelector((state) => state.workspace)
    const dispatch = useDispatch()
    const { user, isLoaded } = useUser()
    const { getToken } = useAuth()
    const { userMemberships, isLoaded: isOrgLoaded } = useOrganizationList({ userMemberships: true })

    // Initial load of theme
    useEffect(() => {
        dispatch(loadTheme())
    }, [])

    // Initial load of workspaces
    useEffect(() => {
        if (isLoaded && user && workspaces.length === 0) {
            dispatch(fetchWorkspaces({ getToken }))
        }
    }, [dispatch, user, isLoaded, workspaces.length, getToken])

    // Fallback sync: if webhook/event sync is delayed, persist Clerk orgs directly.
    useEffect(() => {
        const syncClerkOrganizations = async () => {
            if (!isLoaded || !isOrgLoaded || !user) return;
            if (!userMemberships?.data?.length) return;

            const token = await getToken();
            if (!token) return;

            await Promise.all(
                userMemberships.data.map(({ organization }) =>
                    api.post(
                        '/api/workspaces/sync-clerk',
                        {
                            id: organization.id,
                            name: organization.name,
                            slug: organization.slug,
                            image_url: organization.imageUrl || ''
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                    )
                )
            );

            dispatch(fetchWorkspaces({ getToken }));
        };

        syncClerkOrganizations();
    }, [dispatch, getToken, isLoaded, isOrgLoaded, user, userMemberships?.data])


    if (!user) {
        return (
            <div className='flex justify-center items-center h-screen bg-white dark:bg-zinc-950'>
                <SignIn />
            </div>
        )
    }

    if (loading) return (
        <div className='flex items-center justify-center h-screen bg-white dark:bg-zinc-950'>
            <Loader2Icon className="size-7 text-blue-500 animate-spin" />
        </div>
    )

    if (user && workspaces.length === 0) {
        return (
            <div className='min-h-screen flex justify-center items-center'>
                <CreateOrganization afterCreateOrganizationUrl="/" />
            </div>
        )
    }

    return (
        <div className="flex bg-white dark:bg-zinc-950 text-gray-900 dark:text-slate-100">
            <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
            <div className="flex-1 flex flex-col h-screen">
                <Navbar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
                <div className="flex-1 h-full p-6 xl:p-10 xl:px-16 overflow-y-scroll">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

export default Layout
