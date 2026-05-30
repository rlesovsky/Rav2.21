// RefreshContext — carries the lifted refreshKey so any page can re-fetch when
// the Topbar refresh button is pressed (which also clears the API cache).
import { createContext, useContext } from "react"

export const RefreshContext = createContext({ refreshKey: 0 })

export const useRefreshKey = () => useContext(RefreshContext).refreshKey
