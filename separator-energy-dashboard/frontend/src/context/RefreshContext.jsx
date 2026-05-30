/* =============================================================================
 * RefreshContext — the DriftView global refresh contract (spec §7, Addendum C).
 *
 * Replaces App.jsx's hardcoded REFRESH_COMPONENT_COUNT = 8. Data components
 * register as subscribers when they mount and unregister when they unmount, so
 * a refresh expects exactly the number of components mounted *at trigger time*.
 * This is what makes tabbed (partially-mounted) pages report completion
 * correctly: an unmounted chart is not waited on.
 *
 * Existing data components keep their ({ refreshKey, onRefreshComplete }) prop
 * contract untouched. The <RefreshSlot> wrapper owns register/unregister and
 * feeds those two props down, so no data component needs editing in Phase 1.
 * ============================================================================= */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

const RefreshContext = createContext(null)

export function useRefresh() {
  const ctx = useContext(RefreshContext)
  if (!ctx) throw new Error('useRefresh must be used within <RefreshProvider>')
  return ctx
}

export function RefreshProvider({ children }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const subscribersRef = useRef(0)   // currently mounted subscribers
  const expectedRef = useRef(0)      // snapshot taken at trigger time
  const completedRef = useRef(0)
  const isRefreshingRef = useRef(false)

  const register = useCallback(() => {
    subscribersRef.current += 1
    return () => {
      subscribersRef.current -= 1
    }
  }, [])

  const triggerRefresh = useCallback(() => {
    expectedRef.current = subscribersRef.current
    completedRef.current = 0
    if (expectedRef.current === 0) return
    isRefreshingRef.current = true
    setIsRefreshing(true)
    setRefreshKey((k) => k + 1)
  }, [])

  const reportComplete = useCallback(() => {
    // Only count completions that belong to an in-flight refresh. Initial mounts
    // and StrictMode's dev double-invoke call this too; ignore those.
    if (!isRefreshingRef.current) return
    completedRef.current += 1
    if (completedRef.current >= expectedRef.current) {
      isRefreshingRef.current = false
      setIsRefreshing(false)
    }
  }, [])

  const value = {
    refreshKey,
    isRefreshing,
    register,
    triggerRefresh,
    reportComplete,
  }

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>
}

/* Wraps a single data component: registers it as a refresh subscriber for as
 * long as it is mounted, and supplies refreshKey + onRefreshComplete.
 *
 * Usage:  <RefreshSlot render={(p) => <LiveStatusCard {...p} />} />
 */
export function RefreshSlot({ render }) {
  const { refreshKey, register, reportComplete } = useRefresh()
  useEffect(() => register(), [register])
  return render({ refreshKey, onRefreshComplete: reportComplete })
}
