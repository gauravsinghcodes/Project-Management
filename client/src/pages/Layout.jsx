import { useState, useEffect, useRef } from 'react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { Outlet } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { loadTheme } from '../features/themeSlice'
import { Loader2Icon } from 'lucide-react'
import { useUser, SignIn, useAuth, CreateOrganization, useOrganizationList } from '@clerk/react'
import { fetchWorkspaces } from '../features/workspaceSlice'

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [isPolling, setIsPolling] = useState(false)
    const pollingRef = useRef(null)
    const { loading, workspaces } = useSelector((state) => state.workspace)
    const dispatch = useDispatch()
    const { user, isLoaded } = useUser()
    const { getToken } = useAuth()
    const { userMemberships } = useOrganizationList({ userMemberships: { infinite: true } })

    // Initial load of theme
    useEffect(() => {
        dispatch(loadTheme())
    }, [])

    // Initial load of workspaces
    useEffect(() => {
        if (isLoaded && user && workspaces.length === 0) {
            dispatch(fetchWorkspaces({ getToken }))
        }
    }, [user, isLoaded])

    // When user has a Clerk org but DB hasn't synced yet, start polling
    // Inngest cloud takes ~1-3 seconds to process and write the workspace
    useEffect(() => {
        const clerkHasOrg = userMemberships?.data?.length > 0
        const dbEmpty = workspaces.length === 0
        const ready = isLoaded && user

        if (ready && clerkHasOrg && dbEmpty && !isPolling) {
            setIsPolling(true)
        }
        if (workspaces.length > 0 && isPolling) {
            setIsPolling(false)
        }
    }, [userMemberships?.data, workspaces, isLoaded, user])

    // Run the poll interval
    useEffect(() => {
        if (isPolling) {
            pollingRef.current = setInterval(() => {
                dispatch(fetchWorkspaces({ getToken }))
            }, 2000)
        } else {
            clearInterval(pollingRef.current)
        }
        return () => clearInterval(pollingRef.current)
    }, [isPolling])

    if (!user) {
        return (
            <div className='flex justify-center items-center h-screen bg-white dark:bg-zinc-950'>
                <SignIn />
            </div>
        )
    }

    if (loading && workspaces.length === 0) return (
        <div className='flex items-center justify-center h-screen bg-white dark:bg-zinc-950'>
            <Loader2Icon className="size-7 text-blue-500 animate-spin" />
        </div>
    )

    if (user && workspaces.length === 0) {
        return (
            <div className='min-h-screen flex flex-col justify-center items-center gap-4'>
                <CreateOrganization />
                {isPolling && (
                    <div className='flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400'>
                        <Loader2Icon className="size-4 animate-spin" />
                        <span>Setting up your workspace...</span>
                    </div>
                )}
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
